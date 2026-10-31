(() => {
	const STORE_CONFIG = window.STORE_CONFIG || {
		name: "Shubham Cosmetic & General Store",
		whatsappNumber: "919250203173"
	};
	const SUPABASE_CONFIG = window.SUPABASE_CONFIG || {};
	const supabaseClient = window.supabase?.createClient && SUPABASE_CONFIG.url && SUPABASE_CONFIG.anonKey
		? window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey)
		: null;

	const PRODUCT_CATEGORIES = [
		"Makeup",
		"Skincare",
		"Haircare",
		"Nail Care",
		"Beauty Accessories",
		"Bangles",
		"Fragrance",
		"Women's Care"
	];
	const CATEGORIES = ["All", ...PRODUCT_CATEGORIES];

	const CATEGORY_EMOJIS = {
		"Makeup": "💄",
		"Skincare": "🧴",
		"Haircare": "🪮",
		"Nail Care": "💅",
		"Beauty Accessories": "🎀",
		"Bangles": "💍",
		"Fragrance": "🌸",
		"Women's Care": "🩷",
		"Women’s Care": "🩷"
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
		customerSession: null,
		customerProfile: null
	};

	// ── Product catalogue state ───────────────────────────────────────────────
	let catalogProducts = [];         // The live product catalogue
	let supabaseLoadSucceeded = false; // True once Supabase has returned real data at least once
	let productFetchInFlight = false;  // Guard against duplicate simultaneous fetch requests

	// DOM Elements
	const productGrid = document.querySelector("#productGrid");
	const filterList = document.querySelector("#filterList");
	const categoryList = document.querySelector("#categoryList");
	const productDialog = document.querySelector("#productDialog");
	const cartDialog = document.querySelector("#cartDialog");
	const profileDialog = document.querySelector("#profileDialog");
	const toast = document.querySelector("#toast");
	const customerLoginButton = document.querySelector("#customerLoginButton");
	const customerButtonText = document.querySelector("#customerButtonText");

	let toastTimer = null;

	function normalizeCategory(category) {
		if (!category) return "";
		return category.replace(/[’']/g, "'").trim();
	}

	function escapeHtml(value) {
		return String(value ?? "").replace(/[&<>"']/g, (character) => ({
			"&": "&amp;",
			"<": "&lt;",
			">": "&gt;",
			'"': "&quot;",
			"'": "&#39;"
		})[character]);
	}

	function showToast(message) {
		if (!toast) return;
		toast.textContent = message;
		toast.classList.add("visible");
		clearTimeout(toastTimer);
		toastTimer = setTimeout(() => {
			toast.classList.remove("visible");
		}, 3000);
	}

	function imageUrl(imageReference, width = 640) {
		if (!imageReference || typeof imageReference !== "string") {
			return "assets/images/shubham-general-store-logo.svg";
		}

		const ref = imageReference.trim();

		if (/^https?:\/\//i.test(ref) || /^data:image\//i.test(ref)) {
			return ref;
		}

		if (ref.startsWith("assets/")) {
			return ref;
		}

		if (/^photo-[A-Za-z0-9-]+$/.test(ref)) {
			return `https://images.unsplash.com/${ref}?auto=format&fit=crop&w=${width}&q=80`;
		}

		if (supabaseClient) {
			const { data } = supabaseClient.storage.from("product-images").getPublicUrl(ref);
			if (data?.publicUrl) return data.publicUrl;
		}

		return ref;
	}

	function attachImageFallback(imgElement, fallbackElement) {
		if (!imgElement || !fallbackElement) return;
		imgElement.addEventListener("error", () => {
			imgElement.hidden = true;
			fallbackElement.hidden = false;
			fallbackElement.style.display = "grid";
		}, { once: true });
	}

	function renderStoreName() {
		const name = STORE_CONFIG.name || "Shubham Cosmetic & General Store";
		document.title = `${name} | Cosmetics and Beauty Essentials`;

		document.querySelectorAll("[data-store-name]").forEach((element) => {
			element.textContent = name;
		});

		document.querySelectorAll("[data-store-wordmark]").forEach((element) => {
			const words = name.trim().split(/\s+/);
			const firstWord = words[0];
			const remainingWords = words.slice(1).join(" ").toUpperCase();

			const primary = document.createElement("span");
			primary.className = "brand-primary";
			primary.textContent = firstWord;

			const subtitle = document.createElement("span");
			subtitle.className = "brand-subtitle";
			subtitle.textContent = remainingWords;

			element.replaceChildren(primary, subtitle);
		});
	}

	function renderCategories() {
		if (categoryList) {
			categoryList.innerHTML = PRODUCT_CATEGORIES.map((category) => {
				const emoji = CATEGORY_EMOJIS[category] || "✨";
				return `
					<button class="category-tile" type="button" data-category="${escapeHtml(category)}">
						<span class="category-image">
							<span class="category-emoji" aria-hidden="true">${emoji}</span>
						</span>
						<span class="category-tile-label">${escapeHtml(category)}</span>
					</button>
				`;
			}).join("");
		}

		if (filterList) {
			filterList.innerHTML = CATEGORIES.map((category) => `
				<button class="filter-chip" type="button" data-category="${escapeHtml(category)}"
					aria-pressed="${state.category === category}">
					${escapeHtml(category)}
				</button>
			`).join("");
		}

		const categoryLinks = PRODUCT_CATEGORIES.map((category) =>
			`<a href="#shop" data-nav-category="${escapeHtml(category)}">${escapeHtml(category)}</a>`
		).join("");

		const navLinks = document.querySelector("#navCategoryLinks");
		if (navLinks) navLinks.innerHTML = categoryLinks;

		const footerLinks = document.querySelector("#footerCategoryLinks");
		if (footerLinks) footerLinks.innerHTML = categoryLinks;

		renderBrandList();
	}

	function renderBrandList() {
		const brandList = document.querySelector("#brandList");
		if (!brandList) return;

		const brands = [
			...new Set(
				catalogProducts
					.filter((product) => product.published)
					.map((product) => product.brand?.trim())
					.filter(Boolean)
			)
		].slice(0, 8);

		if (brands.length) {
			brandList.innerHTML = brands.map((brand) => `
				<button class="brand-name" type="button" data-brand="${escapeHtml(brand)}">
					${escapeHtml(brand)}
				</button>
			`).join("");
		} else {
			brandList.innerHTML = `
				<button class="brand-name" type="button" data-brand="Swiss Beauty">Swiss Beauty</button>
				<button class="brand-name" type="button" data-brand="Maybelline">Maybelline</button>
				<button class="brand-name" type="button" data-brand="Lakmé">Lakmé</button>
				<button class="brand-name" type="button" data-brand="MARS">MARS</button>
				<button class="brand-name" type="button" data-brand="Colorbar">Colorbar</button>
			`;
		}
	}

	function productCard(product) {
		const discount = product.originalPrice && product.originalPrice > product.price
			? Math.round((1 - product.price / product.originalPrice) * 100)
			: null;

		// null stockQuantity means "unlimited / not tracked" → treat as in-stock
		const available = product.stockStatus === "in-stock" &&
			(product.stockQuantity === undefined || product.stockQuantity === null || product.stockQuantity > 0);

		return `
		<article class="product-card">
			<div class="product-image-wrap">
				<span class="product-tag ${available ? "" : "out-stock"}">
					${available ? (discount ? `${discount}% OFF` : "POPULAR") : "OUT OF STOCK"}
				</span>
				<img src="${escapeHtml(imageUrl(product.image, 480))}" alt="${escapeHtml(product.brand)} ${escapeHtml(product.name)}" loading="lazy">
				<span class="image-fallback" aria-hidden="true">${escapeHtml(product.name)}</span>
				<button class="quick-view" type="button" data-product="${escapeHtml(product.id)}">Quick View</button>
			</div>
			<div class="product-info">
				<p class="product-brand">${escapeHtml(product.brand || "Shubham Store")}</p>
				<a class="product-name" href="#product-${escapeHtml(product.id)}" data-product="${escapeHtml(product.id)}">${escapeHtml(product.name)}</a>
				<div class="price-line">
					<span class="price-current">${money.format(product.price)}</span>
					${product.originalPrice ? `<span class="price-original">${money.format(product.originalPrice)}</span>` : ""}
					${discount ? `<span class="discount-label">${discount}% off</span>` : ""}
				</div>
				<button class="card-add" type="button" ${available ? `data-add="${escapeHtml(product.id)}"` : "disabled"}>
					${available ? "Add to Bag" : "Out of Stock"}
				</button>
			</div>
		</article>`;
	}

	function filteredProducts() {
		const query = state.search.trim().toLowerCase();
		const currentCategoryNorm = normalizeCategory(state.category);

		const products = catalogProducts
			.filter((product) => product.published)
			.filter((product) => {
				const prodCategoryNorm = normalizeCategory(product.category);
				const matchesCategory = state.category === "All" || prodCategoryNorm === currentCategoryNorm;
				const searchable = `${product.name} ${product.brand} ${product.category} ${product.description}`.toLowerCase();
				return matchesCategory && (!query || searchable.includes(query));
			});

		if (state.sort === "price-ascending") {
			products.sort((a, b) => a.price - b.price);
		} else if (state.sort === "price-descending") {
			products.sort((a, b) => b.price - a.price);
		} else if (state.sort === "popular") {
			products.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
		}

		return products;
	}

	function renderProducts() {
		const products = filteredProducts();
		const totalInCatalogue = catalogProducts.filter((p) => p.published).length;

		if (productGrid) {
			// Remove any skeleton cards before rendering real products
			productGrid.classList.remove("is-loading");
			productGrid.innerHTML = products.map(productCard).join("");
			productGrid.hidden = products.length === 0;

			productGrid.querySelectorAll(".product-image-wrap img").forEach((img) => {
				attachImageFallback(img, img.nextElementSibling);
			});
		}

		const resultCount = document.querySelector("#resultCount");
		if (resultCount) {
			resultCount.textContent = `${products.length} ${products.length === 1 ? "product" : "products"}`;
		}

		const emptyResults = document.querySelector("#emptyResults");
		if (emptyResults) {
			if (products.length === 0) {
				emptyResults.hidden = false;
				// Distinguish between "filter shows nothing" vs "catalogue is genuinely empty"
				const heading = emptyResults.querySelector("h3, p");
				if (heading) {
					if (totalInCatalogue === 0) {
						heading.textContent = "No products available yet. Check back soon!";
					} else if (state.search) {
						heading.textContent = `No products found for "${state.search}". Try a different search term.`;
					} else {
						heading.textContent = `No products in the "${state.category}" category yet.`;
					}
				}
			} else {
				emptyResults.hidden = true;
			}
		}

		if (filterList) {
			filterList.querySelectorAll(".filter-chip").forEach((btn) => {
				btn.setAttribute("aria-pressed", String(btn.dataset.category === state.category));
			});
		}
	}

	function findProduct(productId) {
		return catalogProducts.find((p) => String(p.id) === String(productId));
	}

	function openProduct(productId) {
		const product = findProduct(productId);
		if (!product || !productDialog) return;

		state.activeProduct = product;
		state.selectedShade = product.shades?.[0] || "";

		const detail = document.querySelector("#productDetail");
		if (!detail) return;

		const available = product.stockStatus === "in-stock" &&
			(product.stockQuantity === undefined || product.stockQuantity === null || product.stockQuantity > 0);

		const activeImage = (product.shadeImages && state.selectedShade && product.shadeImages[state.selectedShade])
			? product.shadeImages[state.selectedShade]
			: product.image;

		detail.innerHTML = `
		<div class="detail-layout">
			<div class="detail-image">
				<img class="detail-product-image" src="${escapeHtml(imageUrl(activeImage, 800))}" alt="${escapeHtml(product.brand)} ${escapeHtml(product.name)}">
				<span class="image-fallback" aria-hidden="true">${escapeHtml(product.name)}</span>
			</div>
			<div class="detail-copy">
				<p class="product-brand">${escapeHtml(product.brand)}</p>
				<h2 id="detailName">${escapeHtml(product.name)}</h2>
				<p class="detail-price">
					${money.format(product.price)}
					${product.originalPrice ? `<span class="price-original">${money.format(product.originalPrice)}</span>` : ""}
				</p>
				<p class="detail-stock ${available ? "available" : "unavailable"}">
					${available ? `In Stock (${product.stockQuantity !== undefined ? product.stockQuantity : "Available"})` : "Out of Stock"}
				</p>
				<p class="detail-description">${escapeHtml(product.description || "Authentic cosmetic and personal care item from Shubham Store.")}</p>

				${product.shades?.length ? `
					<p class="shade-label">Choose Shade / Variant</p>
					<div class="shade-options" role="group" aria-label="Available shades">
						${product.shades.map((shade, index) => `
							<button class="shade-option" type="button" data-shade="${escapeHtml(shade)}" aria-pressed="${shade === state.selectedShade}">
								<span class="shade-swatch shade-swatch-${index % 6}"></span>
								<span>${escapeHtml(shade)}</span>
							</button>
						`).join("")}
					</div>
					<p class="selected-shade-name">Selected: ${escapeHtml(state.selectedShade || product.shades[0])}</p>
				` : ""}

				<div class="detail-actions">
					<label class="visually-hidden" for="detailQuantity">Quantity</label>
					<input class="quantity-input" id="detailQuantity" type="number" min="1" max="10" value="1">
					<button class="button button-dark" id="detailAdd" type="button" ${available ? "" : "disabled"}>
						${available ? "Add to Bag +" : "Out of Stock"}
					</button>
				</div>
			</div>
		</div>`;

		const detailImg = detail.querySelector(".detail-image img");
		attachImageFallback(detailImg, detailImg.nextElementSibling);

		productDialog.showModal();
	}

	function addToCart(product, quantity = 1, shade = "") {
		const maxQuantity = Math.min(10, product.stockQuantity ?? 10);
		// null stockQuantity means unlimited — treat as in-stock
		const available = product.stockStatus === "in-stock" &&
			(product.stockQuantity === undefined || product.stockQuantity === null || product.stockQuantity > 0);

		if (!available) {
			showToast(`${product.name} is currently out of stock.`);
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
		showToast(`Added ${count} × ${product.name} to your bag ✨`);
		return true;
	}

	function cartSubtotal() {
		return state.cart.reduce((sum, item) => {
			const product = findProduct(item.id);
			return sum + (product?.price || 0) * item.quantity;
		}, 0);
	}

	function cartItemMarkup(item) {
		const product = findProduct(item.id);
		if (!product) return "";

		const maxAllowed = Math.min(10, product.stockQuantity ?? 10);

		return `
		<article class="cart-item">
			<span class="cart-item-image">
				<img src="${escapeHtml(imageUrl(product.image, 160))}" alt="${escapeHtml(product.name)}" loading="lazy">
			</span>
			<div>
				<p class="cart-item-brand">${escapeHtml(product.brand)}</p>
				<p class="cart-item-name">${escapeHtml(product.name)}</p>
				${item.shade ? `<p class="cart-item-shade">Variant / Shade: <strong>${escapeHtml(item.shade)}</strong></p>` : ""}
				<div class="quantity-control" aria-label="Quantity for ${escapeHtml(product.name)}">
					<button type="button" data-quantity="-1" data-id="${escapeHtml(product.id)}" data-shade="${escapeHtml(item.shade)}" aria-label="Decrease quantity">−</button>
					<span>${item.quantity}</span>
					<button type="button" data-quantity="1" data-id="${escapeHtml(product.id)}" data-shade="${escapeHtml(item.shade)}" aria-label="Increase quantity" ${item.quantity >= maxAllowed ? "disabled" : ""}>+</button>
				</div>
			</div>
			<div class="cart-item-end">
				<p class="cart-item-price">${money.format(product.price * item.quantity)}</p>
				<button class="remove-item" type="button" data-remove="${escapeHtml(product.id)}" data-shade="${escapeHtml(item.shade)}">Remove</button>
			</div>
		</article>`;
	}

	function renderCart() {
		const itemCount = state.cart.reduce((sum, item) => sum + item.quantity, 0);

		const cartCount = document.querySelector("#cartCount");
		if (cartCount) cartCount.textContent = itemCount;

		const cartTitleCount = document.querySelector("#cartTitleCount");
		if (cartTitleCount) cartTitleCount.textContent = itemCount ? `(${itemCount})` : "";

		const cartContents = document.querySelector("#cartContents");
		const checkoutForm = document.querySelector("#checkoutForm");

		if (!cartContents) return;

		if (!state.cart.length) {
			cartContents.innerHTML = `
				<div class="empty-cart">
					<span class="empty-mark" aria-hidden="true">✿</span>
					<h3>Your shopping bag is empty</h3>
					<p>Explore our genuine cosmetics and beauty essentials.</p>
					<button class="button button-outline" type="button" id="continueShopping">Browse Collection</button>
				</div>
			`;
			if (checkoutForm) checkoutForm.hidden = true;

			const continueBtn = cartContents.querySelector("#continueShopping");
			if (continueBtn && cartDialog) {
				continueBtn.addEventListener("click", () => cartDialog.close());
			}
			return;
		}

		if (checkoutForm) checkoutForm.hidden = false;

		const subtotal = cartSubtotal();

		cartContents.innerHTML = `
			<div class="cart-items">${state.cart.map(cartItemMarkup).join("")}</div>
			<div class="cart-totals">
				<div class="total-row"><span>Items Subtotal</span><span>${money.format(subtotal)}</span></div>
				<div class="total-row"><span>Delivery</span><span>Calculated on WhatsApp</span></div>
				<div class="total-row grand-total"><span>Estimated Total</span><span>${money.format(subtotal)}</span></div>
				<p class="cart-demo-note">Delivery confirmation and final bill provided directly by the store owner.</p>
			</div>
		`;

		const checkoutSummary = document.querySelector("#checkoutSummary");
		if (checkoutSummary) {
			checkoutSummary.innerHTML = `
				<h4>Order Items (${itemCount})</h4>
				${state.cart.map((item) => {
					const p = findProduct(item.id);
					return `
						<div class="summary-line">
							<span>${escapeHtml(p.brand)} ${escapeHtml(p.name)}${item.shade ? ` (${escapeHtml(item.shade)})` : ""} × ${item.quantity}</span>
							<span>${money.format(p.price * item.quantity)}</span>
						</div>
					`;
				}).join("")}
				<div class="summary-line summary-total">
					<span>Total Amount</span>
					<span>${money.format(subtotal)}</span>
				</div>
			`;
		}
	}

	function makeWhatsAppMessage(formData, orderRef = "") {
		const lines = [
			`*Order Request — ${STORE_CONFIG.name}*`,
			orderRef ? `*Order Reference:* ${orderRef}` : "",
			`--------------------------------------`,
			`*Customer Details:*`,
			`• Name: ${formData.get("customerName")?.trim() || ""}`,
			`• Mobile: ${formData.get("customerPhone")?.trim() || ""}`,
			`• Address: ${formData.get("customerAddress")?.trim() || ""}`,
			`• City: ${formData.get("customerCity")?.trim() || ""}`,
			`• PIN Code: ${formData.get("customerPin")?.trim() || ""}`,
			``,
			`*Ordered Items:*`
		].filter(Boolean);

		state.cart.forEach((item, index) => {
			const product = findProduct(item.id);
			if (product) {
				const shadeText = item.shade ? ` [Shade: ${item.shade}]` : "";
				lines.push(`${index + 1}. ${product.brand} - ${product.name}${shadeText}`);
				lines.push(`   Qty: ${item.quantity} × ${money.format(product.price)} = ${money.format(product.price * item.quantity)}`);
			}
		});

		const subtotal = cartSubtotal();
		lines.push(``);
		lines.push(`*Estimated Subtotal:* ${money.format(subtotal)}`);
		lines.push(`*Delivery:* To be confirmed by store`);

		const notes = formData.get("orderNotes")?.trim();
		if (notes) {
			lines.push(`*Notes:* ${notes}`);
		}

		lines.push(``);
		lines.push(`Please confirm availability and dispatch details. Thank you!`);

		return lines.join("\n");
	}

	function validIndianPhone(value) {
		const digits = (value || "").replace(/\D/g, "");
		const localNumber = digits.length === 12 && digits.startsWith("91")
			? digits.slice(2)
			: digits;
		return /^[6-9]\d{9}$/.test(localNumber);
	}

	/* Load customer profile from Supabase with localStorage fallback */
	async function loadCustomerProfile(user) {
		if (!user) return;

		let profile = null;

		if (supabaseClient) {
			try {
				const { data, error } = await supabaseClient
					.from("customer_profiles")
					.select("full_name, phone, address, city, pincode")
					.eq("id", user.id)
					.maybeSingle();

				if (!error && data) {
					profile = data;
				}
			} catch (err) {
				console.warn("Supabase profile fetch fallback to localStorage:", err);
			}
		}

		// Fallback to localStorage cache
		if (!profile) {
			try {
				const cached = localStorage.getItem(`shubham_customer_profile_${user.id}`);
				if (cached) profile = JSON.parse(cached);
			} catch (_) {}
		}

		state.customerProfile = profile || {};
		applyProfileToForms(state.customerProfile);
	}

	function applyProfileToForms(profile) {
		if (!profile) return;

		// Checkout form
		const nameField = document.querySelector("#customerName");
		const phoneField = document.querySelector("#customerPhone");
		const addressField = document.querySelector("#customerAddress");
		const cityField = document.querySelector("#customerCity");
		const pinField = document.querySelector("#customerPin");

		if (nameField && profile.full_name) nameField.value = profile.full_name;
		if (phoneField && profile.phone) phoneField.value = profile.phone;
		if (addressField && profile.address) addressField.value = profile.address;
		if (cityField && profile.city) cityField.value = profile.city;
		if (pinField && profile.pincode) pinField.value = profile.pincode;

		// Profile modal form
		const profName = document.querySelector("#profileName");
		const profPhone = document.querySelector("#profilePhone");
		const profAddress = document.querySelector("#profileAddress");
		const profCity = document.querySelector("#profileCity");
		const profPin = document.querySelector("#profilePin");

		if (profName && profile.full_name) profName.value = profile.full_name;
		if (profPhone && profile.phone) profPhone.value = profile.phone;
		if (profAddress && profile.address) profAddress.value = profile.address;
		if (profCity && profile.city) profCity.value = profile.city;
		if (profPin && profile.pincode) profPin.value = profile.pincode;

		// My Addresses tab display card
		const displayAddr = document.querySelector("#displaySavedAddress");
		if (displayAddr) {
			if (profile.address) {
				displayAddr.innerHTML = `
					<strong>${escapeHtml(profile.full_name || "Customer")}</strong><br>
					${escapeHtml(profile.address)}<br>
					${escapeHtml(profile.city ? `${profile.city} - ` : "")}${escapeHtml(profile.pincode || "")}<br>
					<span class="addr-phone">📱 Mobile: ${escapeHtml(profile.phone || "—")}</span>
				`;
			} else {
				displayAddr.textContent = "No address saved yet. Update your details in My Profile.";
			}
		}
	}

	async function saveCustomerProfileData(profileData) {
		if (!state.customerSession?.user) return;
		const userId = state.customerSession.user.id;

		// Cache locally
		try {
			localStorage.setItem(`shubham_customer_profile_${userId}`, JSON.stringify(profileData));
		} catch (_) {}

		state.customerProfile = profileData;

		// Save to Supabase
		if (supabaseClient) {
			try {
				await supabaseClient
					.from("customer_profiles")
					.upsert({
						id: userId,
						full_name: profileData.full_name || "",
						phone: profileData.phone || "",
						address: profileData.address || "",
						city: profileData.city || "",
						pincode: profileData.pincode || "",
						updated_at: new Date().toISOString()
					}, { onConflict: "id" });
			} catch (err) {
				console.warn("Could not save profile to Supabase directly:", err);
			}
		}
	}

	async function loadCustomerOrders(user) {
		const container = document.querySelector("#customerOrdersContainer");
		const countPill = document.querySelector("#orderCountPill");
		if (!container) return;

		if (!user || !supabaseClient) {
			container.innerHTML = `
				<div class="empty-orders-view">
					<p class="empty-icon">📦</p>
					<h4>Sign In to View Orders</h4>
					<p>Sign in to your account to review previous orders and check delivery status.</p>
				</div>
			`;
			if (countPill) countPill.hidden = true;
			return;
		}

		container.innerHTML = '<div class="orders-loading"><p>Loading your orders…</p></div>';

		try {
			// Strict RLS ensures this only returns orders for the authenticated user
			const { data, error } = await supabaseClient
				.from("orders")
				.select("*")
				.eq("user_id", user.id)
				.order("created_at", { ascending: false });

			if (error) throw error;

			const orders = Array.isArray(data) ? data : [];

			if (countPill) {
				countPill.textContent = orders.length;
				countPill.hidden = orders.length === 0;
			}

			if (!orders.length) {
				container.innerHTML = `
					<div class="empty-orders-view">
						<p class="empty-icon">🛍️</p>
						<h4>No Orders Yet</h4>
						<p>You haven't placed any orders yet. When you order beauty essentials on WhatsApp, your order summary and status will appear here.</p>
					</div>
				`;
				return;
			}

			container.innerHTML = orders.map((order) => {
				const shortId = order.id ? order.id.slice(0, 8).toUpperCase() : "ORDER";
				const dateStr = order.created_at ? new Date(order.created_at).toLocaleDateString("en-IN", {
					day: "numeric",
					month: "short",
					year: "numeric"
				}) : "Recent";

				const statusClass = `status-${(order.status || 'pending').toLowerCase()}`;
				const items = Array.isArray(order.items) ? order.items : [];

				return `
				<article class="customer-order-card">
					<div class="order-card-top">
						<div>
							<span class="order-number">Order #SHUB-${escapeHtml(shortId)}</span>
							<span class="order-timestamp">${escapeHtml(dateStr)}</span>
						</div>
						<span class="customer-status-badge ${statusClass}">${escapeHtml(order.status || 'Pending')}</span>
					</div>

					<div class="customer-order-items">
						${items.map((it) => `
							<div class="customer-order-item-row">
								<span class="item-meta">
									<strong>${escapeHtml(it.brand ? `${it.brand} - ` : "")}${escapeHtml(it.name || "Item")}</strong>
									${it.shade ? `<span class="item-shade-tag">Shade: ${escapeHtml(it.shade)}</span>` : ""}
								</span>
								<span class="item-qty-price">${it.quantity || 1} × ${money.format(it.price || 0)}</span>
							</div>
						`).join("")}
					</div>

					<div class="customer-order-card-footer">
						<div class="order-address-snippet">
							<small>Delivering to: ${escapeHtml(order.customer_name)}, ${escapeHtml(order.customer_city || order.customer_address)}</small>
						</div>
						<div class="order-total-amount">
							<span>Total:</span>
							<strong>${money.format(order.subtotal || 0)}</strong>
						</div>
					</div>
				</article>
				`;
			}).join("");
		} catch (err) {
			console.warn("Could not load customer orders:", err);
			container.innerHTML = `
				<div class="empty-orders-view">
					<p>⚠️ Could not load orders right now.</p>
					<button type="button" class="button button-outline btn-small" id="retryCustomerOrdersBtn">Try Again</button>
				</div>
			`;
			document.querySelector("#retryCustomerOrdersBtn")?.addEventListener("click", () => {
				loadCustomerOrders(user);
			});
		}
	}

	function updateCustomerLoginUI(session) {
		state.customerSession = session;

		if (!customerLoginButton) return;

		const profileEmail = document.querySelector("#profileUserEmail");
		const profileBadge = document.querySelector("#profileBadge");
		const profileOwnerBadge = document.querySelector("#profileOwnerBadge");
		const ownerTopBar = document.getElementById("ownerTopBar");
		const ownerDashLink = document.getElementById("ownerDashLink");
		const settingsEmail = document.querySelector("#settingsDisplayEmail");
		const ownerSettingItem = document.querySelector("#ownerAdminSettingItem");

		if (session?.user) {
			const displayName = session.user.user_metadata?.full_name ||
				session.user.email?.split("@")[0] || "Account";

			if (customerButtonText) customerButtonText.textContent = displayName;
			customerLoginButton.classList.add("logged-in");
			customerLoginButton.title = `Signed in as ${session.user.email}`;

			if (profileEmail) profileEmail.textContent = session.user.email;
			if (settingsEmail) settingsEmail.textContent = session.user.email;

			if (profileBadge) {
				profileBadge.textContent = "Verified Account";
				profileBadge.classList.remove("guest");
			}

			loadCustomerProfile(session.user);
			loadCustomerOrders(session.user);

			// Check server-side admin status via RPC
			checkIsStoreAdmin(session.user).then((isAdmin) => {
				if (isAdmin) {
					// 👑 Store Owner Mode Activated
					if (ownerTopBar) ownerTopBar.hidden = false;
					if (ownerDashLink) ownerDashLink.hidden = false;
					if (customerButtonText) customerButtonText.textContent = "👑 Owner (Akanksha)";
					if (profileBadge) {
						profileBadge.textContent = "👑 Store Owner";
						profileBadge.classList.remove("guest");
					}
					if (profileOwnerBadge) profileOwnerBadge.hidden = false;
					if (ownerSettingItem) ownerSettingItem.hidden = false;
				} else {
					// Customer Mode Only
					if (ownerTopBar) ownerTopBar.hidden = true;
					if (ownerDashLink) ownerDashLink.hidden = true;
					if (profileOwnerBadge) profileOwnerBadge.hidden = true;
					if (ownerSettingItem) ownerSettingItem.hidden = true;
				}
			});
		} else {
			if (customerButtonText) customerButtonText.textContent = "Login";
			customerLoginButton.classList.remove("logged-in");
			customerLoginButton.title = "Customer Login";

			if (profileEmail) profileEmail.textContent = "Not logged in";
			if (settingsEmail) settingsEmail.textContent = "—";
			if (profileBadge) {
				profileBadge.textContent = "Guest";
				profileBadge.classList.add("guest");
			}

			if (profileOwnerBadge) profileOwnerBadge.hidden = true;
			if (ownerSettingItem) ownerSettingItem.hidden = true;
			if (ownerTopBar) ownerTopBar.hidden = true;
			if (ownerDashLink) ownerDashLink.hidden = true;

			const countPill = document.querySelector("#orderCountPill");
			if (countPill) countPill.hidden = true;
			const ordersContainer = document.querySelector("#customerOrdersContainer");
			if (ordersContainer) ordersContainer.innerHTML = '<p class="empty-orders-view">Sign in to view your orders.</p>';
		}
	}

	/**
	 * loadPublishedProducts()
	 *
	 * SINGLE SOURCE OF TRUTH: Loads all published products from Supabase.
	 *
	 * Key design decisions to prevent products disappearing:
	 *  1. In-flight guard — never runs two simultaneous fetches (race condition fix).
	 *  2. Preserve-on-error — if Supabase is unreachable, the previously loaded
	 *     products remain visible. We never clear the grid on a transient error.
	 *  3. Error ≠ Empty catalogue — an API error shows a retry notice, NOT demo products.
	 *  4. Empty Supabase (genuinely 0 published products) shows demo products only as
	 *     a starter, clearly flagged in console.
	 *  5. null stock_quantity is treated as "in-stock" (unlimited), not out-of-stock.
	 *  6. Loading skeleton is shown while fetching so the grid is never blank.
	 */
	async function loadPublishedProducts() {
		// ── Guard: skip if a fetch is already running ───────────────────────
		if (productFetchInFlight) {
			console.log("[Products] Fetch already in progress — skipping duplicate call.");
			return;
		}
		productFetchInFlight = true;

		// ── Show loading skeleton immediately ──────────────────────────────
		showProductsLoading();

		let fetchSucceeded = false;
		let fetchError = null;

		if (supabaseClient) {
			try {
				const { data, error } = await supabaseClient
					.from("products")
					.select("*")
					.eq("is_published", true)
					.order("created_at", { ascending: false });

				if (error) {
					// Supabase returned a structured API error (e.g. RLS, bad query)
					fetchError = error;
					console.error("[Products] Supabase query error:", error.message || error);
				} else if (Array.isArray(data)) {
					// ✅ Successful query — update catalogProducts with fresh data
					catalogProducts = data.map((row) => ({
						id: row.id,
						name: row.name,
						brand: row.brand,
						category: row.category,
						description: row.description,
						price: Number(row.price),
						originalPrice: row.mrp ? Number(row.mrp) : undefined,
						image: imageUrl(row.image_path),
						shades: Array.isArray(row.variants) ? row.variants : (row.variants ? [row.variants] : []),
						// Fix: null stock_quantity means unlimited — treat as in-stock
						stockQuantity: row.stock_quantity ?? null,
						stockStatus: (row.stock_quantity === null || row.stock_quantity === undefined || row.stock_quantity > 0)
							? "in-stock"
							: "out-of-stock",
						isDemo: false,
						published: true,
						popularity: typeof row.popularity === "number" ? row.popularity : 90
					}));
					supabaseLoadSucceeded = true;
					fetchSucceeded = true;

					if (data.length === 0) {
						console.info("[Products] Supabase returned 0 published products. " +
							"Either no products have been added yet, or all are unpublished. " +
							"Showing demo starter products as placeholder.");
					} else {
						console.info(`[Products] Loaded ${data.length} published product(s) from Supabase.`);
					}
				}
			} catch (err) {
				// Network-level error (Supabase paused, DNS failure, offline)
				fetchError = err;
				console.error("[Products] Network error while fetching products:", err?.message || err);
			}
		} else {
			console.warn("[Products] Supabase client not initialised — supabase-config.js may be missing.");
		}

		productFetchInFlight = false;

		// ── Handle results ─────────────────────────────────────────────────

		if (!fetchSucceeded) {
			if (supabaseLoadSucceeded) {
				// We previously loaded real products — PRESERVE THEM.
				// A transient error must never clear a working catalogue.
				console.warn("[Products] Fetch failed — keeping previously loaded products visible.");
				showNetworkRetryNotice();
				// Re-render with the preserved data (no change to catalogProducts)
				renderProducts();
			} else {
				// First-ever load failed (project paused, new deployment, etc.)
				// Show demo products as a temporary placeholder only.
				console.warn("[Products] First load failed — showing demo placeholder products.");
				const starter = (window.DEMO_PRODUCTS || []).map((p) => ({
					...p,
					published: true,
					stockStatus: (p.stockQuantity === undefined || p.stockQuantity === null || p.stockQuantity > 0)
						? "in-stock"
						: "out-of-stock"
				}));
				catalogProducts = starter;
				showNetworkRetryNotice();
				renderCategories();
				renderProducts();
			}
			return;
		}

		// ── Success: if Supabase returned 0 results and we haven't previously
		//    loaded real data, show demo products as a visual placeholder.
		if (catalogProducts.length === 0 && !supabaseLoadSucceeded) {
			const starter = (window.DEMO_PRODUCTS || []).map((p) => ({
				...p,
				published: true,
				stockStatus: (p.stockQuantity === undefined || p.stockQuantity === null || p.stockQuantity > 0)
					? "in-stock"
					: "out-of-stock"
			}));
			catalogProducts = starter;
		}

		hideNetworkRetryNotice();
		renderCategories();
		renderProducts();
	}

	/** Show a skeleton/loading placeholder while products are being fetched */
	function showProductsLoading() {
		if (!productGrid) return;
		// Only show skeleton if the grid is currently empty (first load)
		// Don't replace existing products with a loading state — that would cause flickering
		if (catalogProducts.length > 0) return;

		productGrid.hidden = false;
		productGrid.innerHTML = Array.from({ length: 6 }, () => `
			<article class="product-card product-card-skeleton" aria-hidden="true">
				<div class="product-image-wrap skeleton-img"></div>
				<div class="product-info">
					<div class="skeleton-line skeleton-brand"></div>
					<div class="skeleton-line skeleton-name"></div>
					<div class="skeleton-line skeleton-price"></div>
					<div class="skeleton-line skeleton-btn"></div>
				</div>
			</article>
		`).join("");
	}

	/** Show a non-intrusive retry notice when a network error occurs */
	function showNetworkRetryNotice() {
		let notice = document.getElementById("networkRetryNotice");
		if (!notice) {
			notice = document.createElement("div");
			notice.id = "networkRetryNotice";
			notice.className = "network-retry-notice";
			notice.setAttribute("role", "status");
			notice.innerHTML = `
				<span>⚡ Having trouble reaching the store — showing last available products.</span>
				<button type="button" id="retryProductLoad">Retry</button>
			`;
			const shopSection = document.querySelector("#shop") || document.body;
			shopSection.insertBefore(notice, shopSection.firstChild);

			document.getElementById("retryProductLoad")?.addEventListener("click", () => {
				hideNetworkRetryNotice();
				loadPublishedProducts();
			});
		}
		notice.hidden = false;
	}

	function hideNetworkRetryNotice() {
		const notice = document.getElementById("networkRetryNotice");
		if (notice) notice.hidden = true;
	}

	// ── Auth Dialog helpers ───────────────────────────────────────────────────

	function openAuthDialog() {
		const authDialog = document.getElementById("authDialog");
		if (!authDialog) {
			// Fallback: if the dialog is missing, try Google directly
			if (supabaseClient) triggerGoogleLogin();
			else showToast("Login unavailable. Supabase is not configured.");
			return;
		}
		resetAuthDialog();

		// Show a connection-problem banner if Supabase is unreachable
		if (!supabaseClient) {
			const feedback = document.getElementById("authFeedback");
			if (feedback) feedback.textContent = "⚠️ Cannot connect to the store database. Please try again later or contact the store owner.";
		}

		authDialog.showModal();
	}

	function resetAuthDialog() {
		const feedback = document.getElementById("authFeedback");
		if (feedback) {
			feedback.textContent = "";
			feedback.classList.remove("success");
		}
	}

	function triggerGoogleLogin() {
		if (!supabaseClient) {
			showToast("⚠️ Cannot reach the server right now. Your Supabase project may be paused.");
			const feedback = document.getElementById("authFeedback");
			if (feedback) feedback.textContent = "⚠️ Server unreachable. Please resume the Supabase project at app.supabase.com, then try again.";
			return;
		}

		// Build the redirect URL: always send back to the exact page the user is on
		const redirectTo = window.location.origin + window.location.pathname;

		supabaseClient.auth.signInWithOAuth({
			provider: "google",
			options: {
				queryParams: { prompt: "select_account" },
				redirectTo
			}
		}).catch((err) => {
			console.error("Google OAuth error:", err);
			const isNetworkError = !err?.message || err.message.toLowerCase().includes("fetch") || err.message.toLowerCase().includes("network");
			if (isNetworkError) {
				showToast("Cannot reach the server. Your Supabase project may be paused.");
				const feedback = document.getElementById("authFeedback");
				if (feedback) feedback.textContent = "⚠️ Server unreachable. See the fix guide below or contact the store owner.";
			} else {
				showToast(`Google login failed: ${err.message}`);
			}
		});
	}

	/**
	 * Checks if the currently authenticated user is the store owner/admin.
	 * Uses a server-side RPC to avoid client-only checks.
	 */
	async function checkIsStoreAdmin(user) {
		if (!user || !supabaseClient) return false;

		// Quick email check — but still requires RPC server confirmation
		const OWNER_EMAIL = "akanksha101108@gmail.com";
		const userEmail = (user.email || "").toLowerCase().trim();

		try {
			const { data, error } = await supabaseClient.rpc("is_store_admin");
			if (!error && data === true) return true;
		} catch (err) {
			console.warn("is_store_admin RPC check failed:", err);
			// Final fallback: email comparison (only if server call fails entirely)
			if (userEmail === OWNER_EMAIL) return true;
		}

		return false;
	}

	function setupEventListeners() {
		// Search form
		const searchForm = document.querySelector("#searchForm");
		const searchInput = document.querySelector("#searchInput");

		if (searchForm && searchInput) {
			searchForm.addEventListener("submit", (e) => {
				e.preventDefault();
				state.search = searchInput.value;
				renderProducts();
				document.querySelector("#shop")?.scrollIntoView({ behavior: "smooth" });
			});

			searchInput.addEventListener("input", (e) => {
				state.search = e.currentTarget.value;
				renderProducts();
			});
		}

		// Sort select
		const sortSelect = document.querySelector("#sortSelect");
		if (sortSelect) {
			sortSelect.addEventListener("change", (e) => {
				state.sort = e.currentTarget.value;
				renderProducts();
			});
		}

		// Reset filters button
		const resetFilters = document.querySelector("#resetFilters");
		if (resetFilters) {
			resetFilters.addEventListener("click", () => {
				state.category = "All";
				state.search = "";
				if (searchInput) searchInput.value = "";
				renderProducts();
			});
		}

		// Cart open
		const openCartBtn = document.querySelector("#openCart");
		if (openCartBtn && cartDialog) {
			openCartBtn.addEventListener("click", () => {
				renderCart();
				cartDialog.showModal();
			});
		}

		// Mobile navigation toggle
		const menuToggle = document.querySelector("#menuToggle");
		const mainNav = document.querySelector("#mainNav");
		if (menuToggle && mainNav) {
			menuToggle.addEventListener("click", () => {
				const isOpen = mainNav.classList.toggle("open");
				menuToggle.setAttribute("aria-expanded", String(isOpen));
			});
		}

		// Global delegation
		document.addEventListener("click", (event) => {
			// Category tile click
			const categoryBtn = event.target.closest("[data-category]");
			if (categoryBtn) {
				state.category = categoryBtn.dataset.category;
				renderProducts();
				document.querySelector("#shop")?.scrollIntoView({ behavior: "smooth" });
				return;
			}

			// Nav category link click
			const navCat = event.target.closest("[data-nav-category]");
			if (navCat) {
				state.category = navCat.dataset.navCategory;
				renderProducts();
				if (mainNav) mainNav.classList.remove("open");
				if (menuToggle) menuToggle.setAttribute("aria-expanded", "false");
				return;
			}

			// Brand click
			const brandBtn = event.target.closest("[data-brand]");
			if (brandBtn) {
				state.search = brandBtn.dataset.brand;
				if (searchInput) searchInput.value = state.search;
				renderProducts();
				document.querySelector("#shop")?.scrollIntoView({ behavior: "smooth" });
				return;
			}

			// Add to bag from card
			const addBtn = event.target.closest("[data-add]");
			if (addBtn) {
				const product = findProduct(addBtn.dataset.add);
				if (product) {
					addToCart(product, 1, product.shades?.[0] || "");
				}
				return;
			}

			// Product details open
			const productLink = event.target.closest("[data-product]");
			if (productLink) {
				event.preventDefault();
				openProduct(productLink.dataset.product);
				return;
			}

			// Shade button click in details
			const shadeBtn = event.target.closest("[data-shade]");
			if (shadeBtn && productDialog) {
				state.selectedShade = shadeBtn.dataset.shade;

				productDialog.querySelectorAll(".shade-option").forEach((btn) => {
					btn.setAttribute("aria-pressed", String(btn === shadeBtn));
				});

				const product = state.activeProduct;
				const detailImg = productDialog.querySelector(".detail-product-image");
				if (product && detailImg) {
					const activeShadeImg = product.shadeImages?.[state.selectedShade] || product.image;
					detailImg.src = imageUrl(activeShadeImg, 800);
				}

				const selectedName = productDialog.querySelector(".selected-shade-name");
				if (selectedName) {
					selectedName.textContent = `Selected: ${state.selectedShade}`;
				}
				return;
			}

			// Add to bag from detail modal
			const detailAdd = event.target.closest("#detailAdd");
			if (detailAdd && state.activeProduct && productDialog) {
				const qtyInput = productDialog.querySelector("#detailQuantity");
				const quantity = qtyInput ? qtyInput.value : 1;
				if (addToCart(state.activeProduct, quantity, state.selectedShade)) {
					productDialog.close();
				}
				return;
			}

			// Cart quantity adjustment
			const qtyBtn = event.target.closest("[data-quantity]");
			if (qtyBtn) {
				const itemId = qtyBtn.dataset.id;
				const itemShade = qtyBtn.dataset.shade || "";
				const change = Number(qtyBtn.dataset.quantity);

				const item = state.cart.find((i) => String(i.id) === String(itemId) && i.shade === itemShade);
				const product = item && findProduct(item.id);

				if (item && product) {
					const maxAllowed = Math.min(10, product.stockQuantity ?? 10);
					item.quantity = Math.max(1, Math.min(maxAllowed, item.quantity + change));
					renderCart();
				}
				return;
			}

			// Cart item remove
			const removeBtn = event.target.closest("[data-remove]");
			if (removeBtn) {
				const itemId = removeBtn.dataset.remove;
				const itemShade = removeBtn.dataset.shade || "";

				state.cart = state.cart.filter(
					(i) => !(String(i.id) === String(itemId) && i.shade === itemShade)
				);
				renderCart();
				showToast("Item removed from your bag");
				return;
			}

			// Dialog close
			const closeBtn = event.target.closest("[data-close-dialog]");
			if (closeBtn) {
				const dialogId = closeBtn.dataset.closeDialog;
				const dlg = document.getElementById(dialogId);
				if (dlg) dlg.close();
				return;
			}
		});

		// Customer Account Button in Header — opens Auth Dialog
		if (customerLoginButton) {
			customerLoginButton.addEventListener("click", () => {
				if (state.customerSession?.user) {
					// Already logged in → open Customer Profile Modal
					if (profileDialog) profileDialog.showModal();
				} else {
					// Not logged in → open the Auth Dialog (Google Sign-In)
					openAuthDialog();
				}
			});
		}

		// ── Auth Dialog: Google OAuth button ──────────────────────────────────
		const googleAuthBtn = document.getElementById("googleAuthBtn");
		if (googleAuthBtn) {
			googleAuthBtn.addEventListener("click", () => {
				triggerGoogleLogin();
			});
		}

		// ── Owner Quick Logout (top bar) ──────────────────────────────────────
		const ownerQuickLogoutBtn = document.getElementById("ownerQuickLogoutBtn");
		if (ownerQuickLogoutBtn && supabaseClient) {
			ownerQuickLogoutBtn.addEventListener("click", async () => {
				await supabaseClient.auth.signOut();
				updateCustomerLoginUI(null);
				showToast("Signed out successfully.");
			});
		}

		// Profile Form Save
		const profileForm = document.querySelector("#customerProfileForm");
		if (profileForm) {
			profileForm.addEventListener("submit", async (e) => {
				e.preventDefault();
				const feedback = document.querySelector("#profileFeedback");
				if (feedback) {
					feedback.textContent = "";
					feedback.classList.remove("success");
				}

				const name = document.querySelector("#profileName")?.value.trim() || "";
				const phone = document.querySelector("#profilePhone")?.value.trim() || "";
				const address = document.querySelector("#profileAddress")?.value.trim() || "";
				const city = document.querySelector("#profileCity")?.value.trim() || "";
				const pin = document.querySelector("#profilePin")?.value.trim() || "";

				if (!name) {
					if (feedback) feedback.textContent = "Please enter your full name.";
					return;
				}
				if (!validIndianPhone(phone)) {
					if (feedback) feedback.textContent = "Please enter a valid 10-digit Indian mobile number.";
					return;
				}
				if (!address) {
					if (feedback) feedback.textContent = "Please enter your complete address.";
					return;
				}
				if (!city) {
					if (feedback) feedback.textContent = "Please enter your city.";
					return;
				}
				if (!/^\d{6}$/.test(pin)) {
					if (feedback) feedback.textContent = "Please enter a valid 6-digit PIN code.";
					return;
				}

				await saveCustomerProfileData({
					full_name: name,
					phone: phone,
					address: address,
					city: city,
					pincode: pin
				});

				applyProfileToForms(state.customerProfile);

				if (feedback) {
					feedback.textContent = "Profile saved successfully!";
					feedback.classList.add("success");
				}
				showToast("Your details have been saved.");
			});
		}

		// Profile Sign Out
		const profileLogoutBtn = document.querySelector("#profileLogoutBtn");
		if (profileLogoutBtn && supabaseClient) {
			profileLogoutBtn.addEventListener("click", async () => {
				try {
					await supabaseClient.auth.signOut();
					updateCustomerLoginUI(null);
					if (profileDialog) profileDialog.close();
					showToast("You have been signed out.");
				} catch (err) {
					console.error("Sign out error:", err);
				}
			});
		}

		// Checkout form submit
		const checkoutForm = document.querySelector("#checkoutForm");
		if (checkoutForm) {
			checkoutForm.addEventListener("submit", async (e) => {
				e.preventDefault();
				const form = e.currentTarget;
				const feedback = document.querySelector("#formFeedback");
				const button = document.querySelector("#whatsappButton");

				if (feedback) {
					feedback.classList.remove("success");
					feedback.textContent = "";
				}

				if (!state.cart.length) {
					if (feedback) feedback.textContent = "Your bag is empty. Please add items before checking out.";
					return;
				}

				const name = form.customerName.value.trim();
				const phone = form.customerPhone.value.trim();
				const address = form.customerAddress.value.trim();
				const city = form.customerCity.value.trim();
				const pin = form.customerPin.value.trim();

				if (!name) {
					if (feedback) feedback.textContent = "Please enter your full name.";
					form.customerName.focus();
					return;
				}
				if (!validIndianPhone(phone)) {
					if (feedback) feedback.textContent = "Please enter a valid 10-digit Indian mobile number.";
					form.customerPhone.focus();
					return;
				}
				if (!address) {
					if (feedback) feedback.textContent = "Please enter your complete delivery address.";
					form.customerAddress.focus();
					return;
				}
				if (!city) {
					if (feedback) feedback.textContent = "Please enter your city.";
					form.customerCity.focus();
					return;
				}
				if (!/^\d{6}$/.test(pin)) {
					if (feedback) feedback.textContent = "Please enter a valid 6-digit PIN code.";
					form.customerPin.focus();
					return;
				}

				// Save customer profile data
				await saveCustomerProfileData({
					full_name: name,
					phone: phone,
					address: address,
					city: city,
					pincode: pin
				});

				// Persist order record to Supabase orders table
				let orderRef = "";
				if (supabaseClient) {
					try {
						const orderItems = state.cart.map((item) => {
							const p = findProduct(item.id);
							return {
								id: item.id,
								name: p?.name || "Product",
								brand: p?.brand || "",
								price: p?.price || 0,
								shade: item.shade || "",
								quantity: item.quantity,
								image: p?.image || ""
							};
						});

						const { data: orderData, error: orderErr } = await supabaseClient
							.from("orders")
							.insert({
								user_id: state.customerSession?.user?.id || null,
								customer_name: name,
								customer_phone: phone,
								customer_address: address,
								customer_city: city,
								customer_pincode: pin,
								order_notes: form.orderNotes?.value?.trim() || "",
								items: orderItems,
								subtotal: cartSubtotal(),
								status: "Pending"
							})
							.select("id")
							.maybeSingle();

						if (!orderErr && orderData?.id) {
							orderRef = `#SHUB-${orderData.id.slice(0, 8).toUpperCase()}`;
							// Reload orders if user is logged in
							if (state.customerSession?.user) {
								loadCustomerOrders(state.customerSession.user);
							}
						}
					} catch (orderInsertErr) {
						console.warn("Notice: order could not be persisted to Supabase database:", orderInsertErr);
					}
				}

				// WhatsApp handoff with order reference
				const message = makeWhatsAppMessage(new FormData(form), orderRef);

				if (button) {
					button.disabled = true;
					const span = button.querySelector("span");
					if (span) span.textContent = "Opening WhatsApp…";
				}

				if (feedback) {
					feedback.textContent = `Order summary ready${orderRef ? ` (${orderRef})` : ""}! Opening WhatsApp to connect with Shubham Store…`;
					feedback.classList.add("success");
				}

				setTimeout(() => {
					const chatUrl = new URL(`https://wa.me/${STORE_CONFIG.whatsappNumber}`);
					chatUrl.searchParams.set("text", message);

					window.open(chatUrl.toString(), "_blank", "noopener,noreferrer");

					// Clear bag after successful order placement
					state.cart = [];
					renderCart();

					if (cartDialog) cartDialog.close();

					if (button) {
						button.disabled = false;
						const span = button.querySelector("span");
						if (span) span.textContent = "Order on WhatsApp";
					}
				}, 400);
			});
		}

		// ── Account Portal Navigation Tabs ────────────────────────────────────
		setupAccountTabs();
	}

	function setupAccountTabs() {
		const accountTabs = document.querySelectorAll(".account-tab");
		const tabPanels = document.querySelectorAll(".tab-panel");

		accountTabs.forEach((tab) => {
			tab.addEventListener("click", () => {
				const targetId = tab.dataset.tab;
				accountTabs.forEach((t) => t.classList.remove("active"));
				tabPanels.forEach((p) => {
					p.classList.remove("active");
					p.hidden = true;
				});

				tab.classList.add("active");
				const targetPanel = document.getElementById(targetId);
				if (targetPanel) {
					targetPanel.classList.add("active");
					targetPanel.hidden = false;
				}

				// If switching to orders tab, refresh user orders
				if (targetId === "tabOrders" && state.customerSession?.user) {
					loadCustomerOrders(state.customerSession.user);
				}
			});
		});

		// Switch to Edit Address button in Tab 3
		document.querySelector("#switchToEditAddressBtn")?.addEventListener("click", () => {
			document.querySelector("#tabBtnProfile")?.click();
			document.querySelector("#profileAddress")?.focus();
		});

		// Refresh orders button in Tab 2
		document.querySelector("#refreshOrdersBtn")?.addEventListener("click", () => {
			if (state.customerSession?.user) {
				loadCustomerOrders(state.customerSession.user);
			}
		});
	}

	function initializeAuth() {
		if (!supabaseClient) return;

		supabaseClient.auth.getSession().then(({ data, error }) => {
			if (!error && data?.session) {
				updateCustomerLoginUI(data.session);
			}
		}).catch((err) => {
			console.warn("Session check notice:", err);
		});

		supabaseClient.auth.onAuthStateChange((_event, session) => {
			updateCustomerLoginUI(session);
		});
	}

	function init() {
		renderStoreName();
		renderCategories();
		renderCart();
		setupEventListeners();
		initializeAuth();
		loadPublishedProducts();
	}

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", init);
	} else {
		init();
	}
})();
