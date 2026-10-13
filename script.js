const STORE_CONFIG = window.STORE_CONFIG;
const SUPABASE_CONFIG = window.SUPABASE_CONFIG || {};
const supabaseClient = window.supabase?.createClient && SUPABASE_CONFIG.url && SUPABASE_CONFIG.anonKey
	? window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey)
	: null;

const PRODUCT_CATEGORIES = ["Makeup", "Skincare", "Haircare", "Nail Care", "Beauty Accessories", "Bangles", "Fragrance", "Women’s Care"];
const CATEGORIES = ["All", ...PRODUCT_CATEGORIES];
const LEGACY_CATEGORY_MIGRATIONS = { Eyes: "Makeup", Face: "Makeup", Nails: "Nail Care", Brushes: "Beauty Accessories" };
const DEMO_PRODUCT_STORAGE_KEY = "blush-bloom-demo-products-v1";
const MAX_PRODUCT_IMAGE_FILE_SIZE = 3 * 1024 * 1024;

const CATEGORY_IMAGES = {
	Makeup: "photo-1522335789203-aabd1fc54bc9",
	Skincare: "photo-1601049541289-9b1b7bbbfe19",
	Haircare: "photo-1522337360788-8b13dee7a37e",
	"Nail Care": "photo-1604654894610-df63bc536371",
	"Beauty Accessories": "photo-1596462502278-27bfdc403348",
	Bangles: "photo-1611591437281-460bfbe1220a",
	Fragrance: "photo-1541643600914-78b084683601",
	"Women’s Care": "photo-1608248543803-ba4f8c70ae0b"
};

const money = new Intl.NumberFormat("en-IN", {
	style: "currency",
	currency: "INR",
	maximumFractionDigits: 0
});

const state = {
	category: "All",
	search: "",
	sort: "popular",
	cart: [],
	activeProduct: null,
	selectedShade: "",
	pendingBulkProducts: null,
	bulkPreviewValid: false,
	bulkHasErrors: false,
	bulkRowSequence: 0,
	bulkDuplicateFlags: [],
	bulkSource: ""
};

const SOURCE_PRODUCTS = window.DEMO_PRODUCTS.map((product) => ({
	...product,
	shades: product.shades ? [...product.shades] : undefined
}));

const productGrid = document.querySelector("#productGrid");
const filterList = document.querySelector("#filterList");
const categoryList = document.querySelector("#categoryList");
const productDialog = document.querySelector("#productDialog");
const cartDialog = document.querySelector("#cartDialog");
const toast = document.querySelector("#toast");

let toastTimer;
let adminPreviewObjectUrl = null;
let adminUploadedImageData = "";

function isAllowedImageReference(image) {
	if (typeof image !== "string" || !image.trim()) return false;

	const reference = image.trim();

	if (/^photo-[A-Za-z0-9-]+$/.test(reference)) return true;

	if (/^data:image\/(?:jpeg|png|webp|gif|avif);base64,[A-Za-z0-9+/=]+$/i.test(reference)) {
		return reference.length <= 600000;
	}

	if (/^https:\/\//i.test(reference)) {
		try {
			const remoteUrl = new URL(reference);
			return remoteUrl.protocol === "https:" && Boolean(remoteUrl.hostname);
		} catch {
			return false;
		}
	}

	const localPath = reference.replace(/^\.\//, "");

	return /^assets\/images\/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.(?:avif|gif|jpe?g|png|webp)$/i.test(localPath) &&
		!localPath.split("/").includes("..");
}

function isValidDemoProduct(product) {
	const hasValidCategory = product && (
		PRODUCT_CATEGORIES.includes(product.category) ||
		(product.category === "Lips" && product.needsCategoryReview && !product.published)
	);

	return product &&
		Number.isInteger(product.id) &&
		typeof product.brand === "string" && product.brand.trim() &&
		typeof product.name === "string" && product.name.trim() &&
		hasValidCategory &&
		typeof product.description === "string" && product.description.trim() &&
		Number.isFinite(product.price) && product.price >= 0 &&
		(product.originalPrice === undefined ||
			(Number.isFinite(product.originalPrice) && product.originalPrice >= 0)) &&
		isAllowedImageReference(product.image) &&
		["in-stock", "out-of-stock"].includes(product.stockStatus) &&
		(product.stockQuantity === undefined ||
			(Number.isInteger(product.stockQuantity) && product.stockQuantity >= 0)) &&
		(product.shades === undefined ||
			(Array.isArray(product.shades) && product.shades.every((shade) => typeof shade === "string"))) &&
		typeof product.isDemo === "boolean" &&
		typeof product.published === "boolean" &&
		typeof product.needsCategoryReview === "boolean";
}

function restoreDemoProducts() {
	try {
		const savedProducts = localStorage.getItem(DEMO_PRODUCT_STORAGE_KEY);
		if (!savedProducts) return;

		const parsedProducts = JSON.parse(savedProducts);
		if (!Array.isArray(parsedProducts)) return;

		const sourceIds = new Set(SOURCE_PRODUCTS.map((product) => product.id));

		const migratedProducts = parsedProducts.map((product) => {
			const needsCategoryReview =
				product.category === "Lips" || Boolean(product.needsCategoryReview);

			const isDemo = typeof product.isDemo === "boolean"
				? product.isDemo
				: sourceIds.has(product.id);

			return {
				...product,
				category: needsCategoryReview
					? "Lips"
					: (LEGACY_CATEGORY_MIGRATIONS[product.category] || product.category),
				isDemo,
				published: needsCategoryReview || isDemo ? false : Boolean(product.published),
				needsCategoryReview
			};
		});

		const uniqueIds = new Set(migratedProducts.map((product) => product.id));

		if (
			migratedProducts.every(isValidDemoProduct) &&
			uniqueIds.size === migratedProducts.length
		) {
			window.DEMO_PRODUCTS.splice(
				0,
				window.DEMO_PRODUCTS.length,
				...migratedProducts
			);
		}
	} catch {
		return;
	}
}

function persistDemoProducts() {
	try {
		localStorage.setItem(DEMO_PRODUCT_STORAGE_KEY, JSON.stringify(DEMO_PRODUCTS));
		return true;
	} catch {
		return false;
	}
}

restoreDemoProducts();

async function loadPublishedProducts() {
	if (!supabaseClient) return;

	const emptyHeading = document.querySelector("#emptyResults h3");
	const emptyDescription = document.querySelector("#emptyResults p");

	emptyHeading.textContent = "Loading products…";
	emptyDescription.textContent = "";

	try {
		const { data, error } = await supabaseClient
			.from("products")
			.select("*")
			.eq("is_published", true)
			.order("created_at", { ascending: false });

		if (error) throw error;

		const products = data.map((row) => {
			const image = /^https:\/\//i.test(row.image_path)
				? row.image_path
				: supabaseClient.storage
					.from("product-images")
					.getPublicUrl(row.image_path).data.publicUrl;

			return {
				id: row.id,
				name: row.name,
				brand: row.brand,
				category: row.category,
				description: row.description,
				price: Number(row.price),
				...(row.mrp === null ? {} : { originalPrice: Number(row.mrp) }),
				image,
				shades: row.variants || [],
				stockQuantity: row.stock_quantity,
				stockStatus: row.stock_quantity > 0 ? "in-stock" : "out-of-stock",
				isDemo: false,
				published: true,
				needsCategoryReview: false,
				popularity: 0
			};
		});

		window.DEMO_PRODUCTS.splice(0, window.DEMO_PRODUCTS.length, ...products);
		renderCategories();
		renderProducts();
	} catch {
		emptyHeading.textContent = "Catalogue unavailable";
		emptyDescription.textContent =
			"The shared product database could not be reached. Check the store setup and try again.";
	}
}

function imageUrl(imageReference, width = 640) {
	if (/^photo-[A-Za-z0-9-]+$/.test(imageReference)) {
		return `https://images.unsplash.com/${imageReference}?auto=format&fit=crop&w=${width}&q=80`;
	}

	return imageReference.replace(/^\.\//, "");
}

function attachImageFallback(image, fallback) {
	image.addEventListener("error", () => {
		image.hidden = true;
		fallback.hidden = false;
		fallback.style.display = "grid";
	}, { once: true });
}

async function compressProductImage(file) {
	if (!file || !file.type.startsWith("image/")) {
		throw new Error("Choose a valid image file.");
	}

	if (file.size > MAX_PRODUCT_IMAGE_FILE_SIZE) {
		throw new Error("Choose an image smaller than 3 MB.");
	}

	const objectUrl = URL.createObjectURL(file);

	try {
		const bitmap = await createImageBitmap(file);
		const scale = Math.min(1, 1000 / Math.max(bitmap.width, bitmap.height));
		const canvas = document.createElement("canvas");

		canvas.width = Math.max(1, Math.round(bitmap.width * scale));
		canvas.height = Math.max(1, Math.round(bitmap.height * scale));

		canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
		bitmap.close();

		return canvas.toDataURL("image/jpeg", 0.72);
	} finally {
		URL.revokeObjectURL(objectUrl);
	}
}

function escapeHtml(value) {
	return String(value).replace(/[&<>"']/g, (character) => ({
		"&": "&amp;",
		"<": "&lt;",
		">": "&gt;",
		'"': "&quot;",
		"'": "&#39;"
	})[character]);
}

function showToast(message) {
	toast.textContent = message;
	toast.classList.add("visible");
	clearTimeout(toastTimer);

	toastTimer = setTimeout(() => {
		toast.classList.remove("visible");
	}, 2600);
}

function renderStoreName() {
	document.title = `${STORE_CONFIG.name} | Cosmetics and beauty`;

	document.querySelector('meta[name="description"]').content =
		`Shop cosmetics and beauty essentials at ${STORE_CONFIG.name}.`;

	document.querySelectorAll("[data-store-name]").forEach((element) => {
		element.textContent = STORE_CONFIG.name;
	});

	document.querySelectorAll("[data-store-wordmark]").forEach((element) => {
		const [firstWord, ...remainingWords] = STORE_CONFIG.name.trim().split(/\s+/);

		const primary = document.createElement("span");
		primary.className = "brand-primary";
		primary.textContent = firstWord;

		const subtitle = document.createElement("span");
		subtitle.className = "brand-subtitle";
		subtitle.textContent = remainingWords.join(" ").toUpperCase();

		element.replaceChildren(primary, subtitle);
	});

	document.querySelectorAll("[data-store-home]").forEach((element) => {
		element.setAttribute("aria-label", `${STORE_CONFIG.name} home`);
	});
}

function renderCategories() {
	categoryList.innerHTML = CATEGORIES.slice(1).map((category) => `
		<button class="category-tile" type="button" data-category="${escapeHtml(category)}">
			
<span class="category-image category-art">
  <span class="category-art-icon" aria-hidden="true">${({
    "Makeup": "💄",
    "Skincare": "🧴",
    "Haircare": "🪮",
    "Nail Care": "💅",
    "Beauty Accessories": "🖌️",
    "Bangles": "💍",
    "Fragrance": "🌸",
    "Women’s Care": "🌷"
  })[category] || "✨"}</span>
</span>

			</span>
			<span>${escapeHtml(category)}</span>
		</button>
	`).join("");

	filterList.innerHTML = CATEGORIES.map((category) => `
		<button class="filter-chip" type="button" data-category="${escapeHtml(category)}"
			aria-pressed="${state.category === category}">
			${escapeHtml(category)}
		</button>
	`).join("");

	const categoryLinks = PRODUCT_CATEGORIES.map((category) =>
		`<a href="#shop" data-nav-category="${escapeHtml(category)}">${escapeHtml(category)}</a>`
	).join("");

	document.querySelector("#navCategoryLinks").innerHTML = categoryLinks;
	document.querySelector("#footerCategoryLinks").innerHTML = categoryLinks;

	const categorySelect = document.querySelector("#adminCategory");
	const selectedCategory = PRODUCT_CATEGORIES.includes(categorySelect.value)
		? categorySelect.value
		: "";

	categorySelect.innerHTML =
		`<option value="">Choose category</option>` +
		PRODUCT_CATEGORIES.map((category) =>
			`<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`
		).join("");

	categorySelect.value = selectedCategory;

	const publishedBrands = [
		...new Set(
			DEMO_PRODUCTS
				.filter((product) => !product.isDemo && product.published)
				.map((product) => product.brand)
		)
	].slice(0, 6);

	document.querySelector("#brandList").innerHTML = publishedBrands.length
		? publishedBrands.map((brand) => `
			<button class="brand-name" type="button" data-brand="${escapeHtml(brand)}">
				${escapeHtml(brand)}
			</button>
		`).join("")
		: `<p class="brand-empty">No owner-entered brands published yet.</p>`;
}
function addBulkProductRow() {
	const rowNumber = ++state.bulkRowSequence;
	const field = (label, name, input, wide = false) =>
		`<label class="bulk-row-field${wide ? " bulk-row-wide" : ""}">${label}${input}</label>`;

	const categoryOptions = PRODUCT_CATEGORIES.map((category) =>
		`<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`
	).join("");

	document.querySelector("#bulkProductRows").insertAdjacentHTML("beforeend", `
		<fieldset class="bulk-product-row" data-bulk-row data-row-number="${rowNumber}">
			<legend>Product ${rowNumber}</legend>
			<button class="bulk-row-remove" type="button" data-remove-bulk-row aria-label="Remove product row ${rowNumber}">Remove row</button>
			<div class="bulk-row-grid">
				${field("Product name *", "name", `<input data-bulk-field="name" required maxlength="100">`)}
				${field("Brand name *", "brand", `<input data-bulk-field="brand" required maxlength="60">`)}
				${field("Category *", "category", `<select data-bulk-field="category" required><option value="">Choose category</option>${categoryOptions}</select>`)}
				${field("Selling price (INR) *", "price", `<input data-bulk-field="price" type="number" min="1" step="1" required>`)}
				${field("MRP (optional)", "mrp", `<input data-bulk-field="mrp" type="number" min="0" step="1">`)}
				${field("Description *", "description", `<textarea data-bulk-field="description" rows="2" maxlength="400" required></textarea>`, true)}
				${field("Image path / URL / photo ID *", "image", `<input data-bulk-field="image" placeholder="assets/images/product.jpg" required>`)}
				${field("Upload photo (optional)", "imageFile", `<input data-bulk-image-file type="file" accept="image/*">`)}
				${field("Shade / size / variant", "shades", `<input data-bulk-field="shades" placeholder="Rose | 50 ml">`)}
				${field("Stock quantity *", "stockQuantity", `<input data-bulk-field="stockQuantity" type="number" min="0" step="1" required>`)}
			</div>
			<p class="bulk-row-feedback" data-bulk-row-feedback role="status"></p>
		</fieldset>
	`);

	const row = document.querySelector("#bulkProductRows").lastElementChild;
	const imageField = row.querySelector('[data-bulk-field="image"]');

	row.querySelector("[data-bulk-image-file]").addEventListener("change", async (event) => {
		const file = event.currentTarget.files[0];
		if (!file) return;

		try {
			row.dataset.imageData = await compressProductImage(file);
			imageField.required = false;
			imageField.placeholder = `Uploaded: ${file.name}`;
			row.querySelector("[data-bulk-row-feedback]").textContent =
				"Photo ready; include it in the next preview.";
			invalidateBulkPreview();
		} catch (error) {
			row.dataset.imageData = "";
			row.querySelector("[data-bulk-row-feedback]").textContent = error.message;
			event.currentTarget.value = "";
		}
	});

	imageField.addEventListener("input", () => {
		row.dataset.imageData = "";
		row.querySelector("[data-bulk-image-file]").value = "";
		imageField.required = true;
		imageField.placeholder = "assets/images/product.jpg";
		invalidateBulkPreview();
	});

	state.pendingBulkProducts = null;
	state.bulkPreviewValid = false;
	state.bulkSource = "manual";
	document.querySelector("#bulkProductPreview").hidden = true;
	document.querySelector("#saveAllProducts").disabled = true;
}

function ensureBulkProductRows() {
	const rows = document.querySelector("#bulkProductRows");
	if (!rows.children.length) {
		for (let row = 0; row < 10; row += 1) addBulkProductRow();
	}
}

function productDuplicateKey(product) {
	return `${product.brand.trim().toLocaleLowerCase()}\u0000${product.name.trim().toLocaleLowerCase()}`;
}

function renderBulkPreview(previewRows) {
	const preview = document.querySelector("#bulkProductPreview");
	const body = document.querySelector("#bulkPreviewRows");

	body.innerHTML = previewRows.map(({ product, errors, duplicate }) => `
		<tr class="${errors.length ? "preview-invalid" : duplicate ? "preview-duplicate" : "preview-valid"}">
			<td>${escapeHtml(product.name || "(missing name)")}<small>${escapeHtml(product.brand || "(missing brand)")}</small></td>
			<td>${escapeHtml(product.category || "—")}</td>
			<td>${Number.isFinite(product.price) ? money.format(product.price) : "—"}${product.originalPrice ? `<small>MRP ${money.format(product.originalPrice)}</small>` : ""}</td>
			<td>${escapeHtml(product.shades?.join(", ") || "—")}</td>
			<td>${Number.isInteger(product.stockQuantity) ? `${product.stockQuantity} · ${product.stockQuantity ? "In stock" : "Out of stock"}` : "—"}</td>
			<td>${product.image ? `<span class="bulk-preview-image"><img src="${escapeHtml(imageUrl(product.image, 120))}" alt="${escapeHtml(product.name)}"><span hidden>Image unavailable</span></span>` : "(missing image)"}</td>
			<td>${errors.length ? escapeHtml(errors.join(" ")) : duplicate ? "Possible duplicate: same brand + name" : "Ready"}</td>
		</tr>
	`).join("");

	body.querySelectorAll(".bulk-preview-image img").forEach((image) => {
		image.addEventListener("error", () => {
			image.hidden = true;
			image.nextElementSibling.hidden = false;
		}, { once: true });
	});

	preview.hidden = previewRows.length === 0;
}

function invalidateBulkPreview() {
	state.pendingBulkProducts = null;
	state.bulkPreviewValid = false;
	state.bulkHasErrors = false;
	document.querySelector("#bulkProductPreview").hidden = true;
	document.querySelector("#saveAllProducts").disabled = true;
}

function refreshCsvDuplicateDecision() {
	if (state.bulkSource !== "csv" || !state.pendingBulkProducts) return;

	const hasDuplicates = state.bulkDuplicateFlags.some(Boolean);

	state.bulkPreviewValid =
		state.pendingBulkProducts.length > 0 &&
		!state.bulkHasErrors &&
		(!hasDuplicates || document.querySelector("#allowDuplicateProducts").checked);

	document.querySelector("#saveAllProducts").disabled = !state.bulkPreviewValid;

	document.querySelector("#bulkImportFeedback").textContent = state.bulkPreviewValid
		? `${state.pendingBulkProducts.length} rows reviewed. Check the preview, then choose Save All Products.`
		: state.bulkHasErrors
			? "Fix the flagged CSV rows and import again. No products have been saved."
			: "Possible duplicates found. Enable Allow duplicate name + brand, or import a corrected CSV.";
}

function previewManualBulkProducts() {
	const feedback = document.querySelector("#bulkManualFeedback");
	feedback.classList.remove("success");
	feedback.textContent = "";

	const previewRows = [];
	const validProducts = [];
	const existingKeys = new Set(DEMO_PRODUCTS.map(productDuplicateKey));
	let hasErrors = false;
	let hasDuplicates = false;

	for (const row of document.querySelectorAll("[data-bulk-row]")) {
		const field = (name) => row.querySelector(`[data-bulk-field="${name}"]`);
		const image = row.dataset.imageData || field("image").value.trim();

		const product = {
			name: field("name").value.trim(),
			brand: field("brand").value.trim(),
			category: field("category").value,
			price: Number(field("price").value),
			description: field("description").value.trim(),
			image,
			shades: field("shades").value.split(/[|,;]/).map((shade) => shade.trim()).filter(Boolean),
			stockQuantity: field("stockQuantity").value.trim() === ""
				? NaN
				: Number(field("stockQuantity").value)
		};

		const originalPriceText = field("mrp").value.trim();
		product.originalPrice = originalPriceText ? Number(originalPriceText) : undefined;

		const hasAnyValue = Boolean(
			product.name || product.brand || field("category").value ||
			field("price").value || originalPriceText || product.description ||
			image || product.shades.length || field("stockQuantity").value
		);

		row.querySelector("[data-bulk-row-feedback]").textContent = "";
		if (!hasAnyValue) continue;

		const errors = [];

		if (!product.name) errors.push("Name required.");
		if (!product.brand) errors.push("Brand required.");
		if (!PRODUCT_CATEGORIES.includes(product.category)) errors.push("Choose category.");
		if (!Number.isFinite(product.price) || product.price <= 0) errors.push("Selling price must be greater than 0.");
		if (product.originalPrice !== undefined &&
			(!Number.isFinite(product.originalPrice) || product.originalPrice <= product.price)) {
			errors.push("MRP must exceed selling price.");
		}
		if (!product.description) errors.push("Description required.");
		if (!isAllowedImageReference(product.image)) errors.push("Valid image required.");
		if (!Number.isInteger(product.stockQuantity) || product.stockQuantity < 0) {
			errors.push("Stock quantity must be 0 or more.");
		}

		const duplicate = existingKeys.has(productDuplicateKey(product));
		if (duplicate) hasDuplicates = true;

		if (errors.length) {
			hasErrors = true;
			row.querySelector("[data-bulk-row-feedback]").textContent = errors.join(" ");
		}

		previewRows.push({ product, errors, duplicate });

		if (!errors.length) {
			validProducts.push({
				...product,
				stockStatus: product.stockQuantity > 0 ? "in-stock" : "out-of-stock",
				isDemo: false,
				needsCategoryReview: false,
				published: document.querySelector("#publishBulkProducts").checked,
				popularity: 0
			});
		}

		existingKeys.add(productDuplicateKey(product));
	}

	state.pendingBulkProducts = validProducts;
	state.bulkHasErrors = hasErrors;
	state.bulkPreviewValid =
		!hasErrors &&
		validProducts.length > 0 &&
		(!hasDuplicates || document.querySelector("#allowDuplicateProducts").checked);

	state.bulkSource = "manual";
	state.bulkDuplicateFlags = previewRows.map((row) => row.duplicate);

	renderBulkPreview(previewRows);
	document.querySelector("#saveAllProducts").disabled = !state.bulkPreviewValid;

	feedback.textContent = hasErrors
		? "Fix the highlighted rows. No products have been saved."
		: !validProducts.length
			? "Enter at least one product before previewing."
			: hasDuplicates && !document.querySelector("#allowDuplicateProducts").checked
				? "Possible duplicates found. Check Allow duplicate name + brand to continue, or edit the duplicate rows."
				: `${validProducts.length} valid product${validProducts.length === 1 ? "" : "s"} ready to save${hasDuplicates ? "; duplicates allowed by your choice" : ""}.`;
}

function saveAllBulkProducts() {
	if (!state.bulkPreviewValid || !state.pendingBulkProducts?.length) return;

	const firstId = Math.max(0, ...DEMO_PRODUCTS.map((product) => product.id)) + 1;

	const products = state.pendingBulkProducts.map((product, index) => ({
		...product,
		id: firstId + index,
		published: Boolean(product.published || document.querySelector("#publishBulkProducts").checked),
		isDemo: false,
		needsCategoryReview: false,
		stockStatus: product.stockQuantity === undefined
			? product.stockStatus
			: (product.stockQuantity > 0 ? "in-stock" : "out-of-stock")
	}));

	DEMO_PRODUCTS.push(...products);
	renderCategories();
	renderProducts();
	renderAdminProducts();

	const saved = persistDemoProducts();
	const publishedCount = products.filter((product) => product.published).length;

	const saveMessage = saved
		? `${products.length} products saved in this browser only; ${publishedCount} published and ${products.length - publishedCount} drafts.`
		: `${products.length} products added for this session only; browser storage is unavailable.`;

	document.querySelector("#bulkManualFeedback").classList.toggle("success", saved);
	document.querySelector("#bulkManualFeedback").textContent = saveMessage;
	document.querySelector("#bulkImportFeedback").textContent =
		state.bulkSource === "csv" ? saveMessage : "";

	document.querySelector("#bulkProductRows").replaceChildren();
	state.bulkRowSequence = 0;
	state.pendingBulkProducts = null;
	state.bulkPreviewValid = false;
	state.bulkSource = "";
	state.bulkDuplicateFlags = [];

	document.querySelector("#bulkProductPreview").hidden = true;
	document.querySelector("#saveAllProducts").disabled = true;

	ensureBulkProductRows();
}

function productCard(product) {
	const discount = product.originalPrice
		? Math.round((1 - product.price / product.originalPrice) * 100)
		: null;

	const available = product.stockStatus === "in-stock" &&
		(product.stockQuantity === undefined || product.stockQuantity > 0);

	const catalogLabel = product.isDemo ? "DEMO SAMPLE" : "OWNER ENTERED · VERIFY";

	return `<article class="product-card">
		<div class="product-image-wrap">
			<span class="product-tag">${available ? catalogLabel : `OUT OF STOCK · ${product.isDemo ? "DEMO" : "VERIFY"}`}</span>
			<img src="${escapeHtml(imageUrl(product.image))}" alt="${escapeHtml(product.brand)} ${escapeHtml(product.name)}" loading="lazy">
			<span class="image-fallback" aria-hidden="true">${escapeHtml(product.name)}</span>
			<button class="quick-view" type="button" data-product="${product.id}">View details</button>
		</div>
		<div class="product-info">
			<p class="product-brand">${escapeHtml(product.brand)}</p>
			<a class="product-name" href="#product-${product.id}" data-product="${product.id}">${escapeHtml(product.name)}</a>
			<div class="price-line">
				<span class="price-current">${money.format(product.price)}</span>
				${product.originalPrice
					? `<span class="price-original">${money.format(product.originalPrice)}</span><span class="discount-label">${discount}% ${product.isDemo ? "demo comparison" : "below entered original"}</span>`
					: ""}
			</div>
			<button class="card-add" type="button" ${available ? `data-add="${product.id}"` : "disabled"}>
				${available ? "Add to bag" : "Out of stock"}
			</button>
		</div>
	</article>`;
}

function filteredProducts() {
	const query = state.search.trim().toLowerCase();

	const products = DEMO_PRODUCTS
		.filter((product) => !product.isDemo && product.published)
		.filter((product) => {
			const matchesCategory = state.category === "All" || product.category === state.category;
			const searchable = `${product.name} ${product.brand} ${product.category} ${product.description}`.toLowerCase();
			return matchesCategory && (!query || searchable.includes(query));
		});

	if (state.sort === "price-ascending") {
		products.sort((first, second) => first.price - second.price);
	}
	if (state.sort === "price-descending") {
		products.sort((first, second) => second.price - first.price);
	}
	if (state.sort === "popular") {
		products.sort((first, second) => second.popularity - first.popularity);
	}

	return products;
}

function renderProducts() {
	const products = filteredProducts();

	productGrid.innerHTML = products.map(productCard).join("");
	document.querySelector("#resultCount").textContent =
		`${products.length} ${products.length === 1 ? "product" : "products"}`;

	document.querySelector("#emptyResults").hidden = products.length > 0;
	productGrid.hidden = products.length === 0;

	const emptyHeading = document.querySelector("#emptyResults h3");
	const emptyDescription = document.querySelector("#emptyResults p");
	const hasPublishedProducts = DEMO_PRODUCTS.some((product) => !product.isDemo && product.published);

	emptyHeading.textContent = hasPublishedProducts
		? "No products match this search"
		: "No products published yet";

	emptyDescription.textContent = hasPublishedProducts
		? "Try another search or browse all products."
		: "Add your real product details in the local product manager, then publish them.";

	filterList.querySelectorAll(".filter-chip").forEach((button) => {
		button.setAttribute("aria-pressed", String(button.dataset.category === state.category));
	});

	productGrid.querySelectorAll(".product-image-wrap img").forEach((image) => {
		attachImageFallback(image, image.nextElementSibling);
	});

	categoryList.querySelectorAll(".category-image img").forEach((image) => {
		attachImageFallback(image, image.nextElementSibling);
	});
}

/* FIX: Supabase IDs strings/UUIDs bhi ho sakte hain. */
function findProduct(productId) {
	return DEMO_PRODUCTS.find(
		(product) => String(product.id) === String(productId)
	);
}

function openProduct(productId) {
	const product = findProduct(productId);
	if (!product) return;

	state.activeProduct = product;
	state.selectedShade = product.shades?.[0] || "";

	const detail = document.querySelector("#productDetail");

	detail.innerHTML = `<div class="detail-layout">
		<div class="detail-image">
			<img src="${escapeHtml(imageUrl(product.image, 800))}" alt="${escapeHtml(product.brand)} ${escapeHtml(product.name)}">
			<span class="image-fallback" aria-hidden="true">${escapeHtml(product.name)}</span>
		</div>
		<div class="detail-copy">
			<p class="product-brand">${escapeHtml(product.brand)} · ${product.isDemo ? "DEMO SAMPLE" : "OWNER ENTERED · VERIFY BEFORE SALE"}</p>
			<h2 id="detailName">${escapeHtml(product.name)}</h2>
			<p class="detail-price">${money.format(product.price)} ${product.originalPrice ? `<span class="price-original">${money.format(product.originalPrice)}</span>` : ""}</p>
			<p class="detail-stock ${product.stockStatus === "in-stock" ? "available" : "unavailable"}">${product.isDemo ? "Sample stock status" : "Owner-entered stock status (not live inventory)"}: ${product.stockStatus === "in-stock" ? "In stock" : "Out of stock"}</p>
			<span class="detail-demo-note">${product.isDemo ? "Sample price only · availability not verified" : "Owner-entered details · verify price, stock and claims before sale"}</span>
			<p class="detail-description">${escapeHtml(product.description)}</p>
			${product.shades?.length ? `<p class="shade-label">Choose a shade</p><div class="shade-options" role="group" aria-label="Available demo shades">${product.shades.map((shade) => `<button class="shade-option" type="button" data-shade="${escapeHtml(shade)}" aria-pressed="${shade === state.selectedShade}">${escapeHtml(shade)}</button>`).join("")}</div>` : ""}
			<div class="detail-actions">
				<label class="visually-hidden" for="detailQuantity">Quantity</label>
				<input class="quantity-input" id="detailQuantity" type="number" min="1" max="10" value="1">
				<button class="button button-dark" id="detailAdd" type="button" ${product.stockStatus === "in-stock" && (product.stockQuantity === undefined || product.stockQuantity > 0) ? "" : "disabled"}>
					${product.stockStatus === "in-stock" && (product.stockQuantity === undefined || product.stockQuantity > 0) ? "Add to bag" : "Out of stock"}
					<span aria-hidden="true">${product.stockStatus === "in-stock" && (product.stockQuantity === undefined || product.stockQuantity > 0) ? "+" : ""}</span>
				</button>
			</div>
		</div>
	</div>`;

	const detailImage = detail.querySelector(".detail-image img");
	attachImageFallback(detailImage, detailImage.nextElementSibling);
	productDialog.showModal();
}

function addToCart(product, quantity = 1, shade = "") {
	const maxQuantity = Math.min(10, product.stockQuantity ?? 10);

	if (product.stockStatus !== "in-stock" || maxQuantity < 1) {
		showToast(`${product.name} is marked out of stock in the demo catalog`);
		return false;
	}

	const count = Math.max(1, Math.min(maxQuantity, Number(quantity) || 1));
	const existing = state.cart.find(
		(item) => String(item.id) === String(product.id) && item.shade === shade
	);

	if (existing) {
		existing.quantity = Math.min(maxQuantity, existing.quantity + count);
	} else {
		state.cart.push({ id: product.id, quantity: count, shade });
	}

	renderCart();
	showToast(`${product.name} added to your bag`);
	return true;
}

function cartItemMarkup(item) {
	const product = findProduct(item.id);
	if (!product) return "";

	return `<article class="cart-item">
		<span class="cart-item-image">
			<img src="${escapeHtml(imageUrl(product.image, 180))}" alt="" loading="lazy">
			<span class="cart-image-fallback" hidden>${escapeHtml(product.name)}</span>
		</span>
		<div>
			<p class="cart-item-brand">${escapeHtml(product.brand)}</p>
			<p class="cart-item-name">${escapeHtml(product.name)}</p>
			${item.shade ? `<p class="cart-item-shade">Shade: ${escapeHtml(item.shade)}</p>` : ""}
			<div class="quantity-control" aria-label="Quantity for ${escapeHtml(product.name)}">
				<button type="button" data-quantity="-1" data-id="${product.id}" data-shade="${escapeHtml(item.shade)}" aria-label="Decrease quantity">−</button>
				<span>${item.quantity}</span>
				<button type="button" data-quantity="1" data-id="${product.id}" data-shade="${escapeHtml(item.shade)}" aria-label="Increase quantity" ${item.quantity >= Math.min(10, product.stockQuantity ?? 10) ? "disabled" : ""}>+</button>
			</div>
		</div>
		<div class="cart-item-end">
			<p class="cart-item-price">${money.format(product.price * item.quantity)}</p>
			<button class="remove-item" type="button" data-remove="${product.id}" data-shade="${escapeHtml(item.shade)}">Remove</button>
		</div>
	</article>`;
}

function cartSubtotal() {
	return state.cart.reduce(
		(sum, item) => sum + (findProduct(item.id)?.price || 0) * item.quantity,
		0
	);
}

function renderCart() {
	const itemCount = state.cart.reduce((sum, item) => sum + item.quantity, 0);

	document.querySelector("#cartCount").textContent = itemCount;
	document.querySelector("#openCart").setAttribute(
		"aria-label",
		`Open shopping bag, ${itemCount} ${itemCount === 1 ? "item" : "items"}`
	);
	document.querySelector("#cartTitleCount").textContent = itemCount ? `(${itemCount})` : "";

	const cartContents = document.querySelector("#cartContents");
	const checkoutForm = document.querySelector("#checkoutForm");

	if (!state.cart.length) {
		cartContents.innerHTML = `<div class="empty-cart">
			<span class="empty-mark" aria-hidden="true">✿</span>
			<h3>Your bag is taking a little breather</h3>
			<p>Find something lovely in our sample edit.</p>
			<button class="button button-outline" type="button" id="continueShopping">Explore the edit</button>
		</div>`;

		checkoutForm.hidden = true;
		cartContents.querySelector("#continueShopping").addEventListener(
			"click",
			() => cartDialog.close()
		);
		return;
	}

	checkoutForm.hidden = false;

	cartContents.innerHTML = `<div class="cart-items">${state.cart.map(cartItemMarkup).join("")}</div>
		<div class="cart-totals">
			<div class="total-row"><span>Subtotal <small>(demo prices)</small></span><span>${money.format(cartSubtotal())}</span></div>
			<div class="total-row"><span>Delivery</span><span>To be confirmed</span></div>
			<div class="total-row grand-total"><span>Estimated total</span><span>${money.format(cartSubtotal())}</span></div>
			<p class="cart-demo-note">Delivery charges and final amount are confirmed by the store owner.</p>
		</div>`;

	cartContents.querySelectorAll(".cart-item-image img").forEach((image) => {
		attachImageFallback(image, image.nextElementSibling);
	});

	document.querySelector("#checkoutSummary").innerHTML =
		`<h4>Order summary · verify product details, prices and availability</h4>` +
		state.cart.map((item) => {
			const product = findProduct(item.id);
			return `<div class="summary-line">
				<span>${escapeHtml(product.brand)} ${escapeHtml(product.name)}${item.shade ? ` · ${escapeHtml(item.shade)}` : ""} × ${item.quantity} @ ${money.format(product.price)}</span>
				<span>${money.format(product.price * item.quantity)}</span>
			</div>`;
		}).join("") +
		`<div class="summary-line summary-total"><span>Cart subtotal · delivery not included</span><span>${money.format(cartSubtotal())}</span></div>
		<div class="summary-line"><span>Delivery charge</span><span>To be confirmed by store</span></div>
		<div class="summary-line"><span>Final payable total</span><span>Pending delivery confirmation</span></div>`;
}

function renderAdminProducts() {
	const list = document.querySelector("#adminProductList");
	const publishedCount = DEMO_PRODUCTS.filter(
		(product) => !product.isDemo && product.published
	).length;

	document.querySelector("#adminProductCount").textContent =
		`${DEMO_PRODUCTS.length} entries · ${publishedCount} published`;

	if (!DEMO_PRODUCTS.length) {
		list.innerHTML = `<p class="admin-catalog-empty">No products yet. Add one with the form.</p>`;
		return;
	}

	list.innerHTML = DEMO_PRODUCTS.map((product) => `
		<article class="admin-product-row">
			<div class="admin-product-copy">
				<strong>${escapeHtml(product.name)}</strong>
				<span>${escapeHtml(product.brand)} · ${escapeHtml(product.needsCategoryReview ? "Needs category review · legacy Lips" : product.category)} · ${money.format(product.price)}</span>
				<span>${product.needsCategoryReview ? "Unpublished · assign a new category before publishing" : product.isDemo ? "Demo sample · never public" : `${product.published ? "Published · owner-entered" : "Draft · not public"} · ${product.stockQuantity === undefined ? (product.stockStatus === "in-stock" ? "Listed in stock" : "Listed out of stock") : `${product.stockQuantity} in stock`}`}</span>
			</div>
			<div class="admin-product-actions">
				${product.isDemo || product.needsCategoryReview ? "" : `<button type="button" data-admin-publish="${product.id}" data-published="${!product.published}" aria-label="${product.published ? "Unpublish" : "Publish"} ${escapeHtml(product.name)}">${product.published ? "Unpublish" : "Publish"}</button>`}
				<button type="button" data-admin-edit="${product.id}" aria-label="${product.needsCategoryReview ? "Review category for" : "Edit"} ${escapeHtml(product.name)}">${product.needsCategoryReview ? "Review" : "Edit"}</button>
				<button type="button" data-admin-delete="${product.id}" aria-label="Delete ${escapeHtml(product.name)}">Delete</button>
			</div>
		</article>
	`).join("");
}

function updateAdminImagePreview() {
	const field = document.querySelector("#adminImage");
	const preview = document.querySelector("#adminImagePreview");
	const image = preview.querySelector("img");
	const fallback = preview.querySelector("span");

	fallback.textContent = "Photo preview";

	const imageReference = adminUploadedImageData || field.value.trim();

	if (!isAllowedImageReference(imageReference)) {
		image.hidden = true;
		fallback.hidden = false;
		return;
	}

	if (adminPreviewObjectUrl) URL.revokeObjectURL(adminPreviewObjectUrl);

	image.hidden = false;
	fallback.hidden = true;

	if (imageReference.startsWith("data:image/")) {
		image.src = imageReference;
	} else {
		image.src = imageUrl(imageReference, 420);
	}

	image.onerror = () => {
		image.hidden = true;
		fallback.hidden = false;
		fallback.textContent = "Preview unavailable; check the image path";
	};
}

function resetAdminForm() {
	const form = document.querySelector("#adminProductForm");
	form.reset();
	adminUploadedImageData = "";

	document.querySelector("#adminProductId").value = "";
	document.querySelector("#adminFormTitle").textContent = "Add a product";
	document.querySelector("#adminSaveButton").textContent = "Add product";
	document.querySelector("#adminCategoryNote").textContent = "";
	document.querySelector("#adminFeedback").textContent = "";
	document.querySelector("#adminFeedback").classList.remove("success");

	updateAdminImagePreview();
}

function editDemoProduct(productId) {
	const product = findProduct(productId);
	if (!product) return;

	const form = document.querySelector("#adminProductForm");

	form.elements.productId.value = product.id;
	form.elements.brand.value = product.brand;
	form.elements.name.value = product.name;
	form.elements.category.value = PRODUCT_CATEGORIES.includes(product.category) ? product.category : "";
	form.elements.stockQuantity.value = product.stockQuantity ?? "";
	form.elements.price.value = product.price;
	form.elements.originalPrice.value = product.originalPrice ?? "";
	form.elements.image.value = product.image;
	form.elements.description.value = product.description;
	form.elements.shades.value = product.shades?.join(", ") || "";
	form.elements.published.checked = Boolean(product.published);

	adminUploadedImageData = product.image.startsWith("data:image/") ? product.image : "";
	form.elements.image.value = adminUploadedImageData ? "" : product.image;

	document.querySelector("#adminFormTitle").textContent = "Edit product";
	document.querySelector("#adminSaveButton").textContent = "Save changes";
	document.querySelector("#adminFeedback").textContent = "";
	document.querySelector("#adminCategoryNote").textContent = product.needsCategoryReview
		? "Legacy category Lips is retained for review. Assign one of the current categories before saving."
		: "";

	updateAdminImagePreview();
	document.querySelector("#adminBrand").focus();
}
async function saveDemoProduct(event) {
	event.preventDefault();

	const form = event.currentTarget;
	const feedback = document.querySelector("#adminFeedback");

	feedback.classList.remove("success");
	feedback.textContent = "";

	if (!form.elements.brand.value.trim() ||
		!form.elements.name.value.trim() ||
		!form.elements.description.value.trim()) {
		feedback.textContent = "Enter a brand, product name, and description.";
		return;
	}

	if (!form.reportValidity()) return;

	const price = Number(form.elements.price.value);

	if (!Number.isFinite(price) || price <= 0) {
		feedback.textContent = "Enter the actual selling price in INR. Products need a price greater than zero.";
		form.elements.price.focus();
		return;
	}

	const stockQuantity = Number(form.elements.stockQuantity.value);

	if (!Number.isInteger(stockQuantity) || stockQuantity < 0) {
		feedback.textContent = "Enter a checked stock quantity (0 or more).";
		form.elements.stockQuantity.focus();
		return;
	}

	const originalPrice = form.elements.originalPrice.value
		? Number(form.elements.originalPrice.value)
		: undefined;

	if (originalPrice !== undefined && originalPrice <= price) {
		feedback.textContent = "Original price must be greater than the current price, or leave it blank.";
		form.elements.originalPrice.focus();
		return;
	}

	let image = adminUploadedImageData || form.elements.image.value.trim();
	const imageFile = form.elements.imageFile.files[0];

	if (imageFile) {
		try {
			image = await compressProductImage(imageFile);
			adminUploadedImageData = image;
		} catch (error) {
			feedback.textContent = error.message;
			form.elements.imageFile.focus();
			return;
		}
	}

	if (!isAllowedImageReference(image)) {
		feedback.textContent = "Choose a product photo, add a local image path, or use a photo-… Unsplash ID/HTTPS URL.";
		(imageFile ? form.elements.imageFile : form.elements.image).focus();
		return;
	}

	const existingId = Number(form.elements.productId.value);
	const existingProduct = existingId ? findProduct(existingId) : null;
	const shades = form.elements.shades.value
		.split(/[|,;]/)
		.map((shade) => shade.trim())
		.filter(Boolean);

	const product = {
		id: existingProduct?.id ?? Math.max(0, ...DEMO_PRODUCTS.map((item) => item.id)) + 1,
		brand: form.elements.brand.value.trim(),
		name: form.elements.name.value.trim(),
		category: form.elements.category.value,
		description: form.elements.description.value.trim(),
		price,
		...(originalPrice === undefined ? {} : { originalPrice }),
		popularity: existingProduct?.popularity ?? 0,
		image,
		stockStatus: stockQuantity > 0 ? "in-stock" : "out-of-stock",
		stockQuantity,
		isDemo: false,
		published: form.elements.published.checked,
		needsCategoryReview: false,
		...(shades.length ? { shades } : {})
	};

	const productIndex = DEMO_PRODUCTS.findIndex(
		(item) => String(item.id) === String(product.id)
	);

	if (productIndex === -1) DEMO_PRODUCTS.push(product);
	else DEMO_PRODUCTS.splice(productIndex, 1, product);

	if (product.stockStatus === "out-of-stock" || !product.published) {
		state.cart = state.cart.filter(
			(item) => String(item.id) !== String(product.id)
		);
	} else if (product.stockQuantity !== undefined) {
		state.cart.forEach((item) => {
			if (String(item.id) === String(product.id)) {
				item.quantity = Math.min(item.quantity, product.stockQuantity);
			}
		});
	}

	renderCategories();
	renderProducts();
	renderCart();
	renderAdminProducts();

	const savedInBrowser = persistDemoProducts();
	resetAdminForm();

	feedback.classList.toggle("success", savedInBrowser);
	feedback.textContent = savedInBrowser
		? `${product.published ? "Product published" : "Product saved as draft"} in this browser only.`
		: "Product updated for this session only; browser storage is unavailable. It will not persist after reload.";
}

function parseCsv(text) {
	const rows = [];
	let row = [];
	let field = "";
	let quoted = false;

	for (let index = 0; index < text.length; index += 1) {
		const character = text[index];

		if (quoted) {
			if (character === '"' && text[index + 1] === '"') {
				field += '"';
				index += 1;
			} else if (character === '"') {
				quoted = false;
			} else {
				field += character;
			}
		} else if (character === '"' && field.trim() === "") {
			quoted = true;
		} else if (character === ",") {
			row.push(field.trim());
			field = "";
		} else if (character === "\n" || character === "\r") {
			if (character === "\r" && text[index + 1] === "\n") index += 1;
			row.push(field.trim());
			if (row.some((value) => value !== "")) rows.push(row);
			row = [];
			field = "";
		} else {
			field += character;
		}
	}

	if (quoted) throw new Error("CSV has an unclosed quoted field.");

	row.push(field.trim());
	if (row.some((value) => value !== "")) rows.push(row);

	return rows;
}

async function importProductCsv() {
	const fileInput = document.querySelector("#bulkCsvFile");
	const feedback = document.querySelector("#bulkImportFeedback");

	feedback.classList.remove("success");
	feedback.textContent = "";

	const file = fileInput.files[0];

	if (!file) {
		feedback.textContent = "Choose a CSV file first.";
		return;
	}

	if (file.size > 1024 * 1024) {
		feedback.textContent = "CSV must be smaller than 1 MB.";
		return;
	}

	feedback.textContent = `Reading ${file.name} and checking every row…`;

	let rows;

	try {
		rows = parseCsv(await file.text());
	} catch (error) {
		feedback.textContent = error.message;
		return;
	}

	if (rows.length < 2) {
		feedback.textContent = "CSV needs a header and at least one product row.";
		return;
	}

	const headers = rows[0].map((header) =>
		header.toLowerCase().replace(/[^a-z]/g, "")
	);

	const headerIndex = Object.fromEntries(
		headers.map((header, index) => [header, index])
	);

	const requiredHeaders = ["name", "brand", "price", "category", "description", "image"];
	const missingHeaders = requiredHeaders.filter(
		(header) => headerIndex[header] === undefined
	);

	if (headerIndex.stockquantity === undefined) missingHeaders.push("stockQuantity");

	if (missingHeaders.length) {
		feedback.textContent =
			`Missing required CSV columns: ${missingHeaders.join(", ")}. Download the template for the expected headers.`;
		return;
	}

	const valueFor = (row, header) =>
		headerIndex[header] === undefined
			? ""
			: (row[headerIndex[header]] || "").trim();

	const newProducts = [];
	const duplicateFlags = [];
	const previewRows = [];
	const existingKeys = new Set(DEMO_PRODUCTS.map(productDuplicateKey));
	let hasErrors = false;

	const firstId = Math.max(0, ...DEMO_PRODUCTS.map((product) => product.id)) + 1;

	for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
		const row = rows[rowIndex];

		if (row.length !== headers.length) {
			hasErrors = true;
			previewRows.push({
				product: {
					name: `CSV row ${rowIndex + 1}`,
					brand: "",
					category: "",
					price: NaN,
					originalPrice: undefined,
					shades: [],
					stockQuantity: NaN,
					image: ""
				},
				errors: [`Expected ${headers.length} cells, received ${row.length}.`],
				duplicate: false
			});
			continue;
		}

		const quantityText = valueFor(row, "stockquantity");
		const stockQuantity = quantityText === "" ? undefined : Number(quantityText);

		const product = {
			id: firstId + newProducts.length,
			name: valueFor(row, "name"),
			brand: valueFor(row, "brand"),
			price: Number(valueFor(row, "price")),
			category: valueFor(row, "category"),
			description: valueFor(row, "description"),
			image: valueFor(row, "image"),
			shades: valueFor(row, "shades").split(/[|;]/).map((shade) => shade.trim()).filter(Boolean),
			stockStatus: stockQuantity > 0 ? "in-stock" : "out-of-stock",
			isDemo: false,
			published: valueFor(row, "published").toLowerCase() === "true",
			needsCategoryReview: false,
			popularity: 0
		};

		if (stockQuantity !== undefined) product.stockQuantity = stockQuantity;

		const mrp = valueFor(row, "mrp");
		if (mrp) product.originalPrice = Number(mrp);

		const errors = [];

		if (!product.name) errors.push("Name required.");
		if (!product.brand) errors.push("Brand required.");
		if (!product.description) errors.push("Description required.");
		if (!Number.isFinite(product.price) || product.price <= 0) errors.push("Selling price must be greater than 0.");
		if (!PRODUCT_CATEGORIES.includes(product.category)) errors.push("Choose a current category.");
		if (!Number.isInteger(stockQuantity) || stockQuantity < 0) errors.push("Stock quantity must be 0 or more.");
		if (!isAllowedImageReference(product.image)) errors.push("Valid image required.");
		if (product.originalPrice !== undefined &&
			(!Number.isFinite(product.originalPrice) || product.originalPrice <= product.price)) {
			errors.push("MRP must exceed selling price.");
		}

		const duplicate = Boolean(
			product.name && product.brand && existingKeys.has(productDuplicateKey(product))
		);

		duplicateFlags.push(duplicate);
		previewRows.push({ product, errors, duplicate });

		if (errors.length) {
			hasErrors = true;
			continue;
		}

		existingKeys.add(productDuplicateKey(product));
		newProducts.push(product);
	}

	state.pendingBulkProducts = newProducts;
	state.bulkSource = "csv";
	state.bulkDuplicateFlags = duplicateFlags;
	state.bulkHasErrors = hasErrors;
	state.bulkPreviewValid =
		newProducts.length > 0 &&
		!hasErrors &&
		(!duplicateFlags.some(Boolean) || document.querySelector("#allowDuplicateProducts").checked);

	renderBulkPreview(previewRows);
	document.querySelector("#bulkManualProducts").open = true;
	document.querySelector("#saveAllProducts").disabled = !state.bulkPreviewValid;

	feedback.classList.toggle("success", state.bulkPreviewValid);
	feedback.textContent = hasErrors
		? "Fix the flagged CSV rows and import again. No products have been saved."
		: !newProducts.length
			? "CSV contains no product rows."
			: duplicateFlags.some(Boolean) && !document.querySelector("#allowDuplicateProducts").checked
				? `${newProducts.length} rows reviewed; possible duplicates found. Enable Allow duplicate name + brand before saving, or fix the CSV and review again.`
				: `${newProducts.length} rows reviewed. Check the preview, then choose Save All Products.`;

	fileInput.value = "";
}

function restoreSourceCatalog() {
	const feedback = document.querySelector("#adminFeedback");

	if (!window.confirm(
		"Replace this browser's catalog with the starter products from products.js? Browser-only product edits will be removed."
	)) return;

	let storageCleared = true;

	try {
		localStorage.removeItem(DEMO_PRODUCT_STORAGE_KEY);
	} catch {
		storageCleared = false;
	}

	window.DEMO_PRODUCTS.splice(
		0,
		window.DEMO_PRODUCTS.length,
		...SOURCE_PRODUCTS.map((product) => ({
			...product,
			shades: product.shades ? [...product.shades] : undefined
		}))
	);

	state.cart = [];

	renderCategories();
	renderProducts();
	renderCart();
	renderAdminProducts();
	resetAdminForm();

	feedback.classList.toggle("success", storageCleared);
	feedback.textContent = storageCleared
		? "Starter catalog from products.js restored; browser-only edits were removed."
		: "Starter catalog restored for this session, but browser storage could not be cleared.";
}

function makeWhatsAppMessage(formData) {
	const lines = [
		`Order request for ${STORE_CONFIG.name}`,
		"",
		"Customer details",
		`Name: ${formData.get("customerName").trim()}`,
		`Phone: ${formData.get("customerPhone").trim()}`,
		`Delivery address: ${formData.get("customerAddress").trim()}`,
		`PIN code: ${formData.get("customerPin").trim()}`,
		"",
		"Items"
	];

	state.cart.forEach((item) => {
		const product = findProduct(item.id);

		lines.push(
			`${product.brand} — ${product.name}${item.shade ? ` (Shade: ${item.shade})` : ""}`,
			`  ${item.quantity} × ${money.format(product.price)} each = ${money.format(product.price * item.quantity)}`
		);
	});

	lines.push(
		"",
		`Cart subtotal: ${money.format(cartSubtotal())}`,
		"Delivery charge: to be confirmed by the store owner",
		`Final payable total: pending; subtotal ${money.format(cartSubtotal())} plus the delivery charge confirmed by the store owner`
	);

	const notes = formData.get("orderNotes").trim();
	if (notes) lines.push("", `Order notes: ${notes}`);

	lines.push(
		"",
		"Please confirm stock availability, delivery charges, and the final amount before processing this order."
	);

	return lines.join("\n");
}

function validIndianPhone(value) {
	const digits = value.replace(/\D/g, "");
	const localNumber = digits.length === 12 && digits.startsWith("91")
		? digits.slice(2)
		: digits;

	return /^[6-9]\d{9}$/.test(localNumber);
}

renderStoreName();
renderCategories();
renderProducts();
renderCart();
renderAdminProducts();
loadPublishedProducts();

document.querySelector("#searchForm").addEventListener("submit", (event) => {
	event.preventDefault();
	state.search = document.querySelector("#searchInput").value;
	renderProducts();
	document.querySelector("#shop").scrollIntoView({ behavior: "smooth" });
});

document.querySelector("#searchInput").addEventListener("input", (event) => {
	state.search = event.currentTarget.value;
	renderProducts();
});

document.querySelector("#sortSelect").addEventListener("change", (event) => {
	state.sort = event.currentTarget.value;
	renderProducts();
});

document.querySelector("#resetFilters").addEventListener("click", () => {
	state.category = "All";
	state.search = "";
	document.querySelector("#searchInput").value = "";
	renderProducts();
});

document.querySelector("#openCart").addEventListener("click", () => {
	cartDialog.showModal();
});

document.querySelector("#openDemoAdmin")?.addEventListener("click", () => {
	resetAdminForm();
	renderAdminProducts();
	ensureBulkProductRows();
	document.querySelector("#adminDialog").showModal();
});

document.querySelector("#adminProductForm").addEventListener("submit", saveDemoProduct);

document.querySelector("#adminImage").addEventListener("input", () => {
	adminUploadedImageData = "";
	document.querySelector("#adminImageFile").value = "";
	updateAdminImagePreview();
});

document.querySelector("#adminImageFile").addEventListener("change", async (event) => {
	const feedback = document.querySelector("#adminFeedback");
	feedback.textContent = "";

	const file = event.currentTarget.files[0];

	if (!file) {
		adminUploadedImageData = "";
		updateAdminImagePreview();
		return;
	}

	try {
		adminUploadedImageData = await compressProductImage(file);
		updateAdminImagePreview();
	} catch (error) {
		adminUploadedImageData = "";
		feedback.textContent = error.message;
		event.currentTarget.value = "";
		updateAdminImagePreview();
	}
});

document.querySelector("#clearAdminForm").addEventListener("click", resetAdminForm);
document.querySelector("#restoreSourceCatalog").addEventListener("click", restoreSourceCatalog);
document.querySelector("#addAnotherProduct").addEventListener("click", addBulkProductRow);
document.querySelector("#previewBulkProducts").addEventListener("click", previewManualBulkProducts);
document.querySelector("#saveAllProducts").addEventListener("click", saveAllBulkProducts);

document.querySelector("#allowDuplicateProducts").addEventListener("change", () => {
	if (state.bulkSource === "manual") previewManualBulkProducts();
	else refreshCsvDuplicateDecision();
});

document.querySelector("#publishBulkProducts").addEventListener("change", () => {
	if (state.bulkSource === "manual") previewManualBulkProducts();
});

document.querySelector("#bulkProductRows").addEventListener("input", (event) => {
	if (event.target.matches("[data-bulk-field]")) invalidateBulkPreview();
});

document.querySelector("#bulkProductRows").addEventListener("change", (event) => {
	if (event.target.matches("[data-bulk-field]")) invalidateBulkPreview();
});

document.querySelector("#importCsvButton").addEventListener("click", async (event) => {
	const button = event.currentTarget;
	button.disabled = true;
	button.textContent = "Importing…";

	try {
		await importProductCsv();
	} finally {
		button.disabled = false;
		button.textContent = "Import CSV";
	}
});

document.querySelector("#menuToggle").addEventListener("click", (event) => {
	const isOpen = document.querySelector("#mainNav").classList.toggle("open");
	event.currentTarget.setAttribute("aria-expanded", String(isOpen));
	event.currentTarget.setAttribute("aria-label", isOpen ? "Close navigation" : "Open navigation");
});

document.addEventListener("click", (event) => {
	const removeBulkRow = event.target.closest("[data-remove-bulk-row]");

	if (removeBulkRow) {
		removeBulkRow.closest("[data-bulk-row]").remove();
		invalidateBulkPreview();
	}

	const editAdminButton = event.target.closest("[data-admin-edit]");
	if (editAdminButton) editDemoProduct(editAdminButton.dataset.adminEdit);

	const deleteAdminButton = event.target.closest("[data-admin-delete]");

	if (deleteAdminButton) {
		const product = findProduct(deleteAdminButton.dataset.adminDelete);

		if (product && window.confirm(`Remove ${product.name} from this browser's demo catalog?`)) {
			const productIndex = DEMO_PRODUCTS.findIndex(
				(item) => String(item.id) === String(product.id)
			);

			if (productIndex !== -1) DEMO_PRODUCTS.splice(productIndex, 1);

			state.cart = state.cart.filter(
				(item) => String(item.id) !== String(product.id)
			);

			renderCategories();
			renderProducts();
			renderCart();
			renderAdminProducts();

			const feedback = document.querySelector("#adminFeedback");
			feedback.classList.toggle("success", persistDemoProducts());
			feedback.textContent = "Product removed from this browser's demo catalog.";
		}
	}

	const publishAdminButton = event.target.closest("[data-admin-publish]");

	if (publishAdminButton) {
		const product = findProduct(publishAdminButton.dataset.adminPublish);

		if (product && !product.isDemo) {
			product.published = publishAdminButton.dataset.published === "true";

			if (!product.published) {
				state.cart = state.cart.filter(
					(item) => String(item.id) !== String(product.id)
				);
			}

			renderCategories();
			renderProducts();
			renderCart();
			renderAdminProducts();

			const saved = persistDemoProducts();
			const feedback = document.querySelector("#adminFeedback");

			feedback.classList.toggle("success", saved);
			feedback.textContent = saved
				? `Product ${product.published ? "published" : "unpublished"} in this browser only.`
				: "Product state changed for this session only; browser storage is unavailable.";
		}
	}

	const categoryButton = event.target.closest("[data-category]");

	if (categoryButton) {
		state.category = categoryButton.dataset.category;
		renderProducts();
		document.querySelector("#shop").scrollIntoView({ behavior: "smooth" });
	}

	const navCategory = event.target.closest("[data-nav-category]");

	if (navCategory) {
		state.category = navCategory.dataset.navCategory;
		renderProducts();
		document.querySelector("#mainNav").classList.remove("open");
		document.querySelector("#menuToggle").setAttribute("aria-expanded", "false");
		document.querySelector("#menuToggle").setAttribute("aria-label", "Open navigation");
	}

	const brandButton = event.target.closest("[data-brand]");

	if (brandButton) {
		document.querySelector("#searchInput").value = brandButton.dataset.brand;
		state.search = brandButton.dataset.brand;
		renderProducts();
		document.querySelector("#shop").scrollIntoView({ behavior: "smooth" });
	}

	const addButton = event.target.closest("[data-add]");

	if (addButton) {
		const product = findProduct(addButton.dataset.add);
		if (product) addToCart(product, 1, product.shades?.[0] || "");
	}

	const productLink = event.target.closest("[data-product]");

	if (productLink) {
		event.preventDefault();
		openProduct(productLink.dataset.product);
	}

	const quantityButton = event.target.closest("[data-quantity]");

	if (quantityButton) {
		const item = state.cart.find(
			(entry) =>
				String(entry.id) === String(quantityButton.dataset.id) &&
				entry.shade === quantityButton.dataset.shade
		);

		const product = item && findProduct(item.id);

		if (item && product) {
			item.quantity = Math.max(
				1,
				Math.min(
					10,
					product.stockQuantity ?? 10,
					item.quantity + Number(quantityButton.dataset.quantity)
				)
			);
		}

		renderCart();
	}

	const removeButton = event.target.closest("[data-remove]");

	if (removeButton) {
		state.cart = state.cart.filter(
			(item) =>
				!(
					String(item.id) === String(removeButton.dataset.remove) &&
					item.shade === removeButton.dataset.shade
				)
		);

		renderCart();
		showToast("Item removed from your bag");
	}

	const shadeButton = event.target.closest("[data-shade]");

	if (shadeButton) {
		state.selectedShade = shadeButton.dataset.shade;

		productDialog.querySelectorAll(".shade-option").forEach((button) => {
			button.setAttribute("aria-pressed", String(button === shadeButton));
		});
	}

	if (event.target.closest("#detailAdd") && state.activeProduct) {
		const quantity = productDialog.querySelector("#detailQuantity").value;

		if (!addToCart(state.activeProduct, quantity, state.selectedShade)) return;

		productDialog.close();
	}

	const closeButton = event.target.closest("[data-close-dialog]");

	if (closeButton) {
		document.getElementById(closeButton.dataset.closeDialog).close();
	}
});

document.querySelector("#checkoutForm").addEventListener("submit", (event) => {
	event.preventDefault();

	const form = event.currentTarget;
	const feedback = document.querySelector("#formFeedback");
	const button = document.querySelector("#whatsappButton");

	feedback.classList.remove("success");
	feedback.textContent = "";

	if (!state.cart.length) {
		feedback.textContent = "Your bag is empty. Add a demo product before continuing.";
		return;
	}

	if (!form.customerName.value.trim()) {
		feedback.textContent = "Please enter your full name.";
		form.customerName.focus();
		return;
	}

	if (!form.customerAddress.value.trim()) {
		feedback.textContent = "Please enter your complete delivery address.";
		form.customerAddress.focus();
		return;
	}

	if (!form.reportValidity()) return;

	if (!validIndianPhone(form.customerPhone.value)) {
		form.customerPhone.setCustomValidity("Enter a valid 10-digit Indian mobile number.");
		form.customerPhone.reportValidity();
		form.customerPhone.setCustomValidity("");
		feedback.textContent = "Please enter a valid 10-digit Indian mobile number.";
		form.customerPhone.focus();
		return;
	}

	if (!/^\d{6}$/.test(form.customerPin.value.trim())) {
		feedback.textContent = "Please enter a valid 6-digit PIN code.";
		form.customerPin.focus();
		return;
	}

	if (!/^91[6-9]\d{9}$/.test(STORE_CONFIG.whatsappNumber)) {
		feedback.textContent = "WhatsApp ordering is not configured yet. Add the store owner's real Indian WhatsApp number in products.js.";
		return;
	}

	const message = makeWhatsAppMessage(new FormData(form));

	button.disabled = true;
	button.querySelector("span").textContent = "Preparing your message…";

	feedback.textContent =
		"Your summary is ready. WhatsApp should open for you to review; send it only when you’re ready.";

	feedback.classList.add("success");

	setTimeout(() => {
		const chatUrl = new URL(`https://wa.me/${STORE_CONFIG.whatsappNumber}`);
		chatUrl.searchParams.set("text", message);

		window.open(chatUrl.toString(), "_blank", "noopener,noreferrer");

		button.disabled = false;
		button.querySelector("span").textContent = "Order on WhatsApp";
	}, 350);
});

document.querySelector("#customerPhone").addEventListener("input", (event) => {
	event.currentTarget.setCustomValidity("");
});