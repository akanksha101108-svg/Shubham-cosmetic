(() => {
    const CATEGORIES = ["Makeup", "Skincare", "Haircare", "Nail Care", "Beauty Accessories", "Bangles", "Fragrance", "Women’s Care"];
    const CONFIG = window.SUPABASE_CONFIG || {};
    const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });
    const loginPanel = document.querySelector("#loginPanel");
    const secureAdmin = document.querySelector("#secureAdmin");
    const configWarning = document.querySelector("#configWarning");
    let client = null;
    let currentUser = null;
    let products = [];
    let editingProduct = null;
    let previewRows = [];

    function setMessage(element, message, success = false) {
        element.textContent = message;
        element.classList.toggle("success", success);
    }

    function esc(value) {
        return String(value ?? "").replace(/[&<>"']/g, character => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
        })[character]);
    }

    function renderCategories() {
        const options = `<option value="">Choose category</option>${CATEGORIES.map(category => `<option value="${esc(category)}">${esc(category)}</option>`).join("")}`;
        document.querySelectorAll('select[name="category"]').forEach(select => {
            select.innerHTML = options;
        });
    }

    async function requireAdmin(user) {
        const { data, error } = await client.from("admin_users")
            .select("user_id").eq("user_id", user.id).maybeSingle();

        if (error) throw error;
        if (!data) throw new Error("This account is not authorized as a store admin.");
        return true;
    }

    async function loadProducts() {
        const { data, error } = await client.from("products")
            .select("*").order("created_at", { ascending: false });

        if (error) throw error;
        products = data || [];
        renderProducts();
    }

    function renderProducts() {
        const list = document.querySelector("#secureProductList");

        if (!products.length) {
            list.innerHTML = `<p class="admin-catalog-empty">No saved products yet. Add a product or import a batch.</p>`;
            return;
        }

        list.innerHTML = products.map(product => `
            <article class="secure-product-row">
                <div class="secure-product-meta">
                    <strong>${esc(product.name)}</strong>
                    <span>${esc(product.brand)} · ${esc(product.category)} · ${money.format(Number(product.price))}</span>
                    <span>Stock: ${product.stock_quantity} · ${product.is_published ? "Published" : "Draft"}</span>
                </div>
                <div class="secure-product-actions">
                    <button type="button" data-edit-id="${esc(product.id)}">Edit</button>
                    <button type="button" data-toggle-id="${esc(product.id)}" data-published="${!product.is_published}">${product.is_published ? "Unpublish" : "Publish"}</button>
                    <button type="button" data-delete-id="${esc(product.id)}">Delete</button>
                </div>
            </article>
        `).join("");
    }

    function clearSingleForm() {
        document.querySelector("#secureProductForm").reset();
        document.querySelector('#secureProductForm [name="id"]').value = "";
        document.querySelector("#secureFormTitle").textContent = "Add Product";
        document.querySelector("#productFormFeedback").textContent = "";
        editingProduct = null;
    }

    function showSingleForm(product = null) {
        editingProduct = product;
        const form = document.querySelector("#secureProductForm");

        form.hidden = false;
        document.querySelector("#secureBulk").hidden = true;
        form.reset();

        form.elements.id.value = product?.id || "";
        form.elements.name.value = product?.name || "";
        form.elements.brand.value = product?.brand || "";
        form.elements.category.value = product?.category || "";
        form.elements.price.value = product?.price || "";
        form.elements.mrp.value = product?.mrp ?? "";
        form.elements.stockQuantity.value = product?.stock_quantity ?? "";
        form.elements.description.value = product?.description || "";
        form.elements.variants.value = product?.variants?.join(" | ") || "";
        form.elements.isPublished.checked = product ? Boolean(product.is_published) : true;

        document.querySelector("#secureFormTitle").textContent = product ? "Edit Product" : "Add Product";
        document.querySelector("#productFormFeedback").textContent = "";
    }

    async function uploadImage(file) {
        if (!file || !["image/jpeg", "image/png", "image/webp", "image/avif"].includes(file.type)) {
            throw new Error("Choose a JPEG, PNG, WebP or AVIF product image.");
        }

        if (file.size > 5 * 1024 * 1024) {
            throw new Error("Image must be 5 MB or smaller.");
        }

        const extension = {
            "image/jpeg": "jpg",
            "image/png": "png",
            "image/webp": "webp",
            "image/avif": "avif"
        }[file.type];

        const path = `${currentUser.id}/${crypto.randomUUID()}.${extension}`;
        const { error } = await client.storage.from("product-images").upload(path, file, {
            contentType: file.type,
            upsert: false
        });

        if (error) throw error;
        return path;
    }

    function normalizedVariants(text) {
        return text.split(/[|,;]/).map(value => value.trim()).filter(Boolean);
    }

    async function saveSingleProduct(event) {
        event.preventDefault();

        const form = event.currentTarget;
        const feedback = document.querySelector("#productFormFeedback");
        setMessage(feedback, "");

        if (!form.reportValidity()) return;

        const price = Number(form.elements.price.value);
        const mrp = form.elements.mrp.value.trim() ? Number(form.elements.mrp.value) : null;
        const quantity = Number(form.elements.stockQuantity.value);

        if (!Number.isFinite(price) || price <= 0 ||
            (mrp !== null && (!Number.isFinite(mrp) || mrp <= price)) ||
            !Number.isInteger(quantity) || quantity < 0) {
            setMessage(feedback, "Check selling price, optional MRP, and stock quantity.");
            return;
        }

        try {
            const file = form.elements.image.files[0];
            const imagePath = file ? await uploadImage(file) : editingProduct?.image_path;

            if (!imagePath) throw new Error("Upload a product image before saving.");

            const record = {
                name: form.elements.name.value.trim(),
                brand: form.elements.brand.value.trim(),
                category: form.elements.category.value,
                price,
                mrp,
                description: form.elements.description.value.trim(),
                image_path: imagePath,
                variants: normalizedVariants(form.elements.variants.value),
                stock_quantity: quantity,
                is_published: form.elements.isPublished.checked,
                created_by: currentUser.id
            };

            let result;

            if (editingProduct) {
                result = await client.from("products").update(record).eq("id", editingProduct.id);
            } else {
                result = await client.from("products").insert(record);
            }

            if (result.error) throw result.error;

            clearSingleForm();
            await loadProducts();
            setMessage(feedback, "Product saved to the shared database.", true);
        } catch (error) {
            setMessage(feedback, error.message || "Product could not be saved.");
        }
    }
        function addSecureBulkRow(values = {}) {
        const row = document.createElement("fieldset");
        row.className = "secure-bulk-row";

        row.innerHTML = `<h4>Product row</h4>
            <label class="field-label">Name
                <input data-field="name" value="${esc(values.name)}">
            </label>
            <label class="field-label">Brand
                <input data-field="brand" value="${esc(values.brand)}">
            </label>
            <label class="field-label">Category
                <select data-field="category">
                    <option value="">Choose</option>
                    ${CATEGORIES.map(category => `<option value="${esc(category)}" ${values.category === category ? "selected" : ""}>${esc(category)}</option>`).join("")}
                </select>
            </label>
            <label class="field-label">Selling price
                <input data-field="price" type="number" min="1" step="0.01" value="${esc(values.price)}">
            </label>
            <label class="field-label">MRP
                <input data-field="mrp" type="number" min="0" step="0.01" value="${esc(values.mrp)}">
            </label>
            <label class="field-label">Stock quantity
                <input data-field="stock" type="number" min="0" step="1" value="${esc(values.stock)}">
            </label>
            <label class="field-label field-wide">Image URL / storage path
                <input data-field="imagePath" value="${esc(values.imagePath)}" placeholder="https://…">
            </label>
            <label class="field-label field-wide">Upload image
                <input data-field="imageFile" type="file" accept="image/jpeg,image/png,image/webp,image/avif">
            </label>
            <label class="field-label field-wide">Description
                <textarea data-field="description" rows="2">${esc(values.description)}</textarea>
            </label>
            <label class="field-label field-wide">Shade / size / variant
                <input data-field="variants" value="${esc(values.variants)}" placeholder="Separate with |">
            </label>
            <button type="button" data-remove-secure-row>Remove row</button>`;

        document.querySelector("#secureBulkRows").append(row);
    }

    function parseCsv(text) {
        const rows = [];
        let row = [];
        let field = "";
        let quoted = false;

        for (let index = 0; index < text.length; index += 1) {
            const ch = text[index];

            if (quoted) {
                if (ch === '"' && text[index + 1] === '"') {
                    field += '"';
                    index += 1;
                } else if (ch === '"') {
                    quoted = false;
                } else {
                    field += ch;
                }
            } else if (ch === '"' && !field.trim()) {
                quoted = true;
            } else if (ch === ",") {
                row.push(field.trim());
                field = "";
            } else if (ch === "\n" || ch === "\r") {
                if (ch === "\r" && text[index + 1] === "\n") index += 1;
                row.push(field.trim());
                if (row.some(Boolean)) rows.push(row);
                row = [];
                field = "";
            } else {
                field += ch;
            }
        }

        if (quoted) throw new Error("CSV has an unclosed quoted field.");

        row.push(field.trim());
        if (row.some(Boolean)) rows.push(row);
        return rows;
    }

    function readSecureBulkRows() {
        return [...document.querySelectorAll(".secure-bulk-row")].map(row => {
            const get = name => row.querySelector(`[data-field="${name}"]`);
            const value = name => get(name).value.trim();
            const mrpText = value("mrp");

            return {
                name: value("name"),
                brand: value("brand"),
                category: value("category"),
                price: Number(value("price")),
                mrp: mrpText ? Number(mrpText) : null,
                stock_quantity: Number(value("stock")),
                description: value("description"),
                image_path: value("imagePath"),
                image_file: get("imageFile").files[0] || null,
                variants: normalizedVariants(value("variants"))
            };
        });
    }

    function validateSecureRows(rows) {
        const seen = new Set();

        return rows.filter(product =>
            product.name || product.brand || product.category ||
            product.description || product.image_path || product.image_file ||
            product.price || product.stock_quantity
        ).map(product => {
            const errors = [];

            if (!product.name || !product.brand || !product.description) {
                errors.push("Name, brand and description are required.");
            }

            if (!CATEGORIES.includes(product.category)) {
                errors.push("Choose a valid category.");
            }

            if (!Number.isFinite(product.price) || product.price <= 0) {
                errors.push("Selling price must be above zero.");
            }

            if (product.mrp !== null &&
                (!Number.isFinite(product.mrp) || product.mrp <= product.price)) {
                errors.push("MRP must exceed selling price.");
            }

            if (!Number.isInteger(product.stock_quantity) || product.stock_quantity < 0) {
                errors.push("Enter a stock quantity of zero or more.");
            }

            if (!product.image_file && !/^https:\/\//i.test(product.image_path)) {
                errors.push("Select an image or provide an HTTPS image URL.");
            }

            const key = `${product.brand.toLowerCase()}\u0000${product.name.toLowerCase()}`;

            const duplicate =
                products.some(existing =>
                    existing.name.trim().toLowerCase() === product.name.toLowerCase() &&
                    existing.brand.trim().toLowerCase() === product.brand.toLowerCase()
                ) || seen.has(key);

            seen.add(key);

            return { product, errors, duplicate };
        });
    }

    function renderBulkReview(results) {
        const body = document.querySelector("#secureBulkPreviewRows");

        body.innerHTML = results.map(({ product, errors, duplicate }) => `
            <tr class="${errors.length ? "preview-invalid" : duplicate ? "preview-duplicate" : "preview-valid"}">
                <td>${esc(product.name)}<small>${esc(product.brand)}</small></td>
                <td>${esc(product.category)}</td>
                <td>${Number.isFinite(product.price) ? money.format(product.price) : "—"}
                    ${product.mrp ? `<small>MRP ${money.format(product.mrp)}</small>` : ""}
                </td>
                <td>${esc(Number.isInteger(product.stock_quantity) ? product.stock_quantity : "—")}</td>
                <td>${esc(product.image_file?.name || product.image_path || "Uploaded file")}</td>
                <td>${esc(errors.join(" ") || (duplicate ? "Duplicate brand + name" : "Ready"))}</td>
            </tr>
        `).join("");

        document.querySelector("#secureBulkPreview").hidden = !results.length;
    }

    async function importCsvPreview() {
        const file = document.querySelector("#secureCsvFile").files[0];

        if (!file) throw new Error("Choose a CSV file first.");

        const rows = parseCsv(await file.text());

        if (rows.length < 2) {
            throw new Error("CSV needs a header and at least one data row.");
        }

        const headers = rows[0].map(header =>
            header.toLowerCase().replace(/[^a-z]/g, "")
        );

        const indexes = Object.fromEntries(
            headers.map((header, index) => [header, index])
        );

        const required = ["name", "brand", "price", "category", "stockquantity", "description"];
        const missing = required.filter(header => indexes[header] === undefined);

        if (missing.length) {
            throw new Error(`Missing CSV columns: ${missing.join(", ")}`);
        }

        const value = (row, key) =>
            indexes[key] === undefined ? "" : (row[indexes[key]] || "").trim();

        return rows.slice(1).map(row => ({
            name: value(row, "name"),
            brand: value(row, "brand"),
            price: Number(value(row, "price")),
            mrp: value(row, "mrp") ? Number(value(row, "mrp")) : null,
            category: value(row, "category"),
            stock_quantity: Number(value(row, "stockquantity")),
            description: value(row, "description"),
            image_path: value(row, "image"),
            image_file: null,
            variants: normalizedVariants(value(row, "shades")),
            is_published: value(row, "published").toLowerCase() === "true"
        }));
    }

    async function saveSecureBulk() {
        const feedback = document.querySelector("#secureBulkFeedback");
        feedback.textContent = "";

        const validation = validateSecureRows(previewRows);
        const overrideDuplicates = document.querySelector("#secureAllowDuplicates").checked;

        const invalid = validation.some(item =>
            item.errors.length || (item.duplicate && !overrideDuplicates)
        );

        if (invalid || !validation.length) {
            feedback.textContent = "Fix invalid rows and confirm any intentional duplicates before saving.";
            return;
        }

        const uploaded = [];

        try {
            const records = [];

            for (const { product } of validation) {
                let imagePath = product.image_path;

                if (product.image_file) {
                    imagePath = await uploadImage(product.image_file);
                    uploaded.push(imagePath);
                }

                records.push({
                    name: product.name,
                    brand: product.brand,
                    category: product.category,
                    price: product.price,
                    mrp: product.mrp,
                    description: product.description,
                    image_path: imagePath,
                    variants: product.variants,
                    stock_quantity: product.stock_quantity,
                    is_published: Boolean(
                        product.is_published ?? document.querySelector("#securePublishBulk").checked
                    ),
                    created_by: currentUser.id
                });
            }

            const { error } = await client.from("products").insert(records);

            if (error) throw error;

            setMessage(feedback, `${records.length} products saved in the shared database.`, true);
            await loadProducts();
            openBulk();
        } catch (error) {
            if (uploaded.length) {
                await client.storage.from("product-images").remove(uploaded);
            }

            setMessage(feedback, error.message || "Bulk save failed; no products were saved.");
        }
    }
        function openBulk() {
        editingProduct = null;
        document.querySelector("#secureProductForm").hidden = true;
        document.querySelector("#secureBulk").hidden = false;

        const rows = document.querySelector("#secureBulkRows");

        if (!rows.children.length) {
            for (let index = 0; index < 10; index += 1) {
                addSecureBulkRow();
            }
        }
    }

    async function handleLogin(event) {
        event.preventDefault();

        const feedback = document.querySelector("#loginFeedback");
        setMessage(feedback, "Signing in…");

        const form = event.currentTarget;

        const { data, error } = await client.auth.signInWithPassword({
            email: form.elements.email.value.trim(),
            password: form.elements.password.value
        });

        form.elements.password.value = "";

        if (error) {
            setMessage(feedback, "Sign-in failed. Check the account and password.");
            return;
        }

        await handleAuthenticatedUser(data.user);
    }

    async function handleAuthenticatedUser(user) {
        currentUser = user;

        const feedback = document.querySelector("#loginFeedback");

        try {
            await requireAdmin(user);

            loginPanel.hidden = true;
            secureAdmin.hidden = false;

            document.querySelector("#adminUserLabel").textContent = user.email;

            await loadProducts();
        } catch (error) {
            setMessage(feedback, error.message || "Admin access could not be verified.");
            await client.auth.signOut();
            currentUser = null;
        }
    }

    async function initialize() {
        if (!CONFIG.url || !CONFIG.anonKey || !window.supabase?.createClient) {
            configWarning.hidden = false;
            configWarning.textContent =
                "Supabase is not configured. Complete the setup in README.md, run supabase/schema.sql, add the project's public URL/key to supabase-config.js, and provision an admin user. No frontend-only password is used.";
            return;
        }

        client = window.supabase.createClient(CONFIG.url, CONFIG.anonKey);

        renderCategories();

        document.querySelector("#adminLoginForm")
            .addEventListener("submit", handleLogin);

        document.querySelector("#signOutButton")
            .addEventListener("click", () =>
                client.auth.signOut().then(() => location.reload())
            );

        document.querySelector("#showSingleProduct")
            .addEventListener("click", () => showSingleForm());

        document.querySelector("#showBulkProducts")
            .addEventListener("click", openBulk);

        document.querySelector("#cancelProductEdit")
            .addEventListener("click", () => {
                document.querySelector("#secureProductForm").hidden = true;
                editingProduct = null;
            });

        document.querySelector("#secureProductForm")
            .addEventListener("submit", saveSingleProduct);

        document.querySelector("#secureAddBulkRow")
            .addEventListener("click", () => addSecureBulkRow());

        document.querySelector("#secureBulkRows")
            .addEventListener("click", event => {
                const remove = event.target.closest("[data-remove-secure-row]");

                if (remove) {
                    remove.closest(".secure-bulk-row")?.remove();
                }
            });

        document.querySelector("#secureReviewBulk")
            .addEventListener("click", async () => {
                const feedback = document.querySelector("#secureBulkFeedback");

                try {
                    const csvFile = document.querySelector("#secureCsvFile").files[0];

                    if (csvFile) {
                        previewRows = await importCsvPreview();
                        document.querySelector("#secureBulkRows").replaceChildren();
                    } else {
                        previewRows = readSecureBulkRows();
                    }

                    const validation = validateSecureRows(previewRows);

                    renderBulkReview(validation);

                    const blocked = validation.some(item =>
                        item.errors.length ||
                        (item.duplicate &&
                            !document.querySelector("#secureAllowDuplicates").checked)
                    );

                    document.querySelector("#secureSaveBulk").disabled =
                        blocked || !validation.length;

                    setMessage(
                        feedback,
                        blocked
                            ? "Fix highlighted rows or approve intentional duplicates."
                            : `${validation.length} product rows are ready to save.`,
                        !blocked
                    );
                } catch (error) {
                    setMessage(feedback, error.message);
                }
            });

        document.querySelector("#secureSaveBulk")
            .addEventListener("click", saveSecureBulk);

        document.querySelector("#secureAllowDuplicates")
            .addEventListener("change", () =>
                document.querySelector("#secureReviewBulk").click()
            );

        document.querySelector("#secureProductList")
            .addEventListener("click", async event => {
                const edit = event.target.closest("[data-edit-id]");
                const toggle = event.target.closest("[data-toggle-id]");
                const remove = event.target.closest("[data-delete-id]");

                if (edit) {
                    const product = products.find(
                        item => item.id === edit.dataset.editId
                    );

                    if (product) showSingleForm(product);
                }

                if (toggle) {
                    const product = products.find(
                        item => item.id === toggle.dataset.toggleId
                    );

                    if (!product) return;

                    const { error } = await client.from("products")
                        .update({
                            is_published: toggle.dataset.published === "true"
                        })
                        .eq("id", product.id);

                    if (error) {
                        alert(error.message);
                    } else {
                        await loadProducts();
                    }
                }

                if (remove && window.confirm(
                    "Delete this product from the shared catalogue?"
                )) {
                    const product = products.find(
                        item => item.id === remove.dataset.deleteId
                    );

                    const { error } = await client.from("products")
                        .delete()
                        .eq("id", remove.dataset.deleteId);

                    if (error) {
                        alert(error.message);
                        return;
                    }

                    if (product?.image_path &&
                        !/^https:\/\//i.test(product.image_path)) {
                        await client.storage.from("product-images")
                            .remove([product.image_path]);
                    }

                    await loadProducts();
                }
            });

        const { data: { session } } = await client.auth.getSession();

        if (session?.user) {
            await handleAuthenticatedUser(session.user);
        }

        client.auth.onAuthStateChange((_event, session) => {
            if (!session) {
                currentUser = null;
                secureAdmin.hidden = true;
                loginPanel.hidden = false;
            }
        });
    }

    initialize();
})();