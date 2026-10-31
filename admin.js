(() => {
    const CATEGORIES = ["Makeup", "Skincare", "Haircare", "Nail Care", "Beauty Accessories", "Bangles", "Fragrance", "Women's Care"];
    const CONFIG = window.SUPABASE_CONFIG || {};
    const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

    const adminAuthGate = document.querySelector("#adminAuthGate");
    const gateLoadingCard = document.querySelector("#gateLoadingCard");
    const gateGuestCard = document.querySelector("#gateGuestCard");
    const gateDeniedCard = document.querySelector("#gateDeniedCard");
    const gateCustomerEmail = document.querySelector("#gateCustomerEmail");
    const gateSignOutBtn = document.querySelector("#gateSignOutBtn");
    const secureAdmin = document.querySelector("#secureAdmin");
    const configWarning = document.querySelector("#configWarning");

    let client = null;
    let currentUser = null;
    let products = [];
    let adminOrders = [];
    let editingProduct = null;
    let previewRows = [];

    // Filters & Search for Products
    let searchQuery = "";
    let selectedCategoryFilter = "All";
    let selectedStatusFilter = "All";

    // Filters & Search for Orders
    let orderSearchQuery = "";
    let selectedOrderStatusFilter = "All";

    function setMessage(element, message, success = false) {
        if (!element) return;
        element.textContent = message;
        element.classList.toggle("success", success);
    }

    function esc(value) {
        return String(value ?? "").replace(/[&<>"']/g, character => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
        })[character]);
    }

    function resolveImageUrl(imagePath) {
        if (!imagePath) return "assets/images/shubham-general-store-logo.svg";
        const path = String(imagePath).trim();
        if (/^https?:\/\//i.test(path) || path.startsWith("data:image/") || path.startsWith("assets/")) {
            return path;
        }
        if (/^photo-[A-Za-z0-9-]+$/.test(path)) {
            return `https://images.unsplash.com/${path}?auto=format&fit=crop&w=300&q=80`;
        }
        if (client) {
            const { data } = client.storage.from("product-images").getPublicUrl(path);
            if (data?.publicUrl) return data.publicUrl;
        }
        return path;
    }

    function renderCategories() {
        const options = `<option value="">Choose category</option>${CATEGORIES.map(category => `<option value="${esc(category)}">${esc(category)}</option>`).join("")}`;
        document.querySelectorAll('select[name="category"]').forEach(select => {
            select.innerHTML = options;
        });

        const filterSelect = document.querySelector("#adminCategoryFilter");
        if (filterSelect) {
            filterSelect.innerHTML = `<option value="All">All Categories</option>${CATEGORIES.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join("")}`;
        }
    }

    async function requireAdmin(user) {
        // Use server-side is_store_admin() RPC for authoritative verification
        // This checks admin_users table AND the hardcoded owner email in Postgres
        try {
            const { data, error } = await client.rpc("is_store_admin");
            if (error) throw error;
            if (data === true) return true;
        } catch (rpcErr) {
            console.warn("is_store_admin RPC failed, falling back to admin_users lookup:", rpcErr);
            // Fallback: direct admin_users table check
            const { data, error } = await client.from("admin_users")
                .select("user_id").eq("user_id", user.id).maybeSingle();
            if (error) throw error;
            if (data) return true;
        }
        throw new Error("This account is not authorized as a store administrator. Only the store owner can access this dashboard.");
    }

    async function loadProducts() {
        const { data, error } = await client.from("products")
            .select("*").order("created_at", { ascending: false });

        if (error) throw error;
        products = data || [];
        updateStats();
        renderProducts();
    }

    function updateStats() {
        const total = products.length;
        const published = products.filter(p => p.is_published).length;
        const drafts = total - published;
        const outOfStock = products.filter(p => Number(p.stock_quantity) <= 0).length;

        const statTotal = document.querySelector("#statTotalProducts");
        const statPub = document.querySelector("#statPublishedProducts");
        const statDraft = document.querySelector("#statDraftProducts");
        const statStock = document.querySelector("#statOutStockProducts");

        if (statTotal) statTotal.textContent = total;
        if (statPub) statPub.textContent = published;
        if (statDraft) statDraft.textContent = drafts;
        if (statStock) statStock.textContent = outOfStock;
    }

    function filteredProductList() {
        return products.filter(p => {
            const matchesCategory = selectedCategoryFilter === "All" || p.category === selectedCategoryFilter;
            const matchesStatus = selectedStatusFilter === "All" ||
                (selectedStatusFilter === "published" && p.is_published) ||
                (selectedStatusFilter === "draft" && !p.is_published);
            const query = searchQuery.trim().toLowerCase();
            const searchable = `${p.name || ""} ${p.brand || ""} ${p.category || ""}`.toLowerCase();
            const matchesSearch = !query || searchable.includes(query);

            return matchesCategory && matchesStatus && matchesSearch;
        });
    }

    function renderProducts() {
        const list = document.querySelector("#secureProductList");
        if (!list) return;

        const filtered = filteredProductList();

        if (!filtered.length) {
            list.innerHTML = `<p class="admin-catalog-empty">No products found matching your current filter. Click "+ Add New Product" or adjust filters above.</p>`;
            return;
        }

        list.innerHTML = filtered.map(product => {
            const thumbUrl = resolveImageUrl(product.image_path);
            return `
            <article class="secure-product-row">
                <div class="secure-product-thumb">
                    <img src="${esc(thumbUrl)}" alt="${esc(product.name)}" loading="lazy" onerror="this.src='assets/images/shubham-general-store-logo.svg'">
                </div>
                <div class="secure-product-meta">
                    <strong>${esc(product.name)}</strong>
                    <span>${esc(product.brand)} · ${esc(product.category)} · <strong>${money.format(Number(product.price))}</strong></span>
                    <span>Stock: ${product.stock_quantity} units · 
                        <span class="admin-badge ${product.is_published ? "badge-published" : "badge-draft"}">
                            ${product.is_published ? "Live / Published" : "Draft (Hidden)"}
                        </span>
                    </span>
                </div>
                <div class="secure-product-actions">
                    <button type="button" data-edit-id="${esc(product.id)}">Edit</button>
                    <button type="button" data-toggle-id="${esc(product.id)}" data-published="${!product.is_published}">
                        ${product.is_published ? "Unpublish" : "Publish"}
                    </button>
                    <button type="button" class="btn-delete" data-delete-id="${esc(product.id)}">Delete</button>
                </div>
            </article>`;
        }).join("");
    }

    function clearSingleForm() {
        const form = document.querySelector("#secureProductForm");
        if (!form) return;
        form.reset();
        form.elements.id.value = "";
        form.elements.existingImagePath.value = "";
        document.querySelector("#secureFormTitle").textContent = "Add New Product";
        document.querySelector("#productFormFeedback").textContent = "";

        const previewBox = document.querySelector("#adminFormImagePreview");
        if (previewBox) previewBox.hidden = true;

        editingProduct = null;
    }

    function showSingleForm(product = null) {
        editingProduct = product;
        const form = document.querySelector("#secureProductForm");
        if (!form) return;

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
        form.elements.existingImagePath.value = product?.image_path || "";
        form.elements.imageUrlInput.value = (/^https?:\/\//i.test(product?.image_path || "")) ? product.image_path : "";

        // Image preview
        const previewBox = document.querySelector("#adminFormImagePreview");
        const previewImg = document.querySelector("#adminFormPreviewImg");

        if (product?.image_path && previewBox && previewImg) {
            previewImg.src = resolveImageUrl(product.image_path);
            previewBox.hidden = false;
        } else if (previewBox) {
            previewBox.hidden = true;
        }

        document.querySelector("#secureFormTitle").textContent = product ? "Edit Product" : "Add New Product";
        document.querySelector("#productFormFeedback").textContent = "";

        form.scrollIntoView({ behavior: "smooth" });
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
        }[file.type] || "jpg";

        const path = `${currentUser.id}/${crypto.randomUUID()}.${extension}`;
        const { error } = await client.storage.from("product-images").upload(path, file, {
            contentType: file.type,
            upsert: false
        });

        if (error) throw error;
        return path;
    }

    function normalizedVariants(text) {
        if (!text) return [];
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

        if (!Number.isFinite(price) || price <= 0) {
            setMessage(feedback, "Please enter a selling price greater than zero.");
            return;
        }
        if (mrp !== null && (!Number.isFinite(mrp) || mrp <= price)) {
            setMessage(feedback, "MRP must exceed selling price, or leave it blank.");
            return;
        }
        if (!Number.isInteger(quantity) || quantity < 0) {
            setMessage(feedback, "Enter a valid stock quantity (0 or more).");
            return;
        }

        try {
            setMessage(feedback, "Saving product to Supabase…");
            const file = form.elements.image.files[0];
            const urlInput = form.elements.imageUrlInput.value.trim();

            let imagePath = editingProduct?.image_path || "";

            if (file) {
                imagePath = await uploadImage(file);
            } else if (urlInput) {
                imagePath = urlInput;
            }

            if (!imagePath) {
                throw new Error("Please upload an image file or provide an image URL.");
            }

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
                created_by: currentUser.id,
                updated_at: new Date().toISOString()
            };

            let result;

            if (editingProduct?.id) {
                result = await client.from("products").update(record).eq("id", editingProduct.id);
            } else {
                result = await client.from("products").insert(record);
            }

            if (result.error) throw result.error;

            clearSingleForm();
            form.hidden = true;
            await loadProducts();
            setMessage(feedback, "Product saved successfully to the live database!", true);
        } catch (error) {
            setMessage(feedback, error.message || "Product could not be saved.");
        }
    }

    function addSecureBulkRow(values = {}) {
        const row = document.createElement("fieldset");
        row.className = "secure-bulk-row";

        row.innerHTML = `<h4>Product Row</h4>
            <label class="field-label">Name *
                <input data-field="name" value="${esc(values.name)}" required placeholder="Product name">
            </label>
            <label class="field-label">Brand *
                <input data-field="brand" value="${esc(values.brand)}" required placeholder="Brand">
            </label>
            <label class="field-label">Category *
                <select data-field="category" required>
                    <option value="">Choose category</option>
                    ${CATEGORIES.map(cat => `<option value="${esc(cat)}" ${values.category === cat ? "selected" : ""}>${esc(cat)}</option>`).join("")}
                </select>
            </label>
            <label class="field-label">Selling Price *
                <input data-field="price" type="number" min="1" step="0.01" value="${esc(values.price)}" required placeholder="₹ Price">
            </label>
            <label class="field-label">MRP
                <input data-field="mrp" type="number" min="0" step="0.01" value="${esc(values.mrp)}" placeholder="₹ MRP">
            </label>
            <label class="field-label">Stock Quantity *
                <input data-field="stock" type="number" min="0" step="1" value="${esc(values.stock)}" required placeholder="Units">
            </label>
            <label class="field-label field-wide">Image URL or Storage Path
                <input data-field="imagePath" value="${esc(values.imagePath)}" placeholder="https://…">
            </label>
            <label class="field-label field-wide">Or Upload Image File
                <input data-field="imageFile" type="file" accept="image/jpeg,image/png,image/webp,image/avif">
            </label>
            <label class="field-label field-wide">Description *
                <textarea data-field="description" rows="2" placeholder="Product description…">${esc(values.description)}</textarea>
            </label>
            <label class="field-label field-wide">Shades / Variants
                <input data-field="variants" value="${esc(values.variants)}" placeholder="Separate with |">
            </label>
            <button type="button" class="btn-delete" data-remove-secure-row>Remove Row</button>`;

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

        if (quoted) throw new Error("CSV contains an unclosed quotation mark.");
        row.push(field.trim());
        if (row.some(Boolean)) rows.push(row);
        return rows;
    }

    function readSecureBulkRows() {
        return [...document.querySelectorAll(".secure-bulk-row")].map(row => {
            const get = name => row.querySelector(`[data-field="${name}"]`);
            const value = name => (get(name)?.value || "").trim();
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
                image_file: get("imageFile")?.files[0] || null,
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
                errors.push("Name, brand and description required.");
            }

            if (!CATEGORIES.includes(product.category)) {
                errors.push("Valid category required.");
            }

            if (!Number.isFinite(product.price) || product.price <= 0) {
                errors.push("Selling price must be above 0.");
            }

            if (product.mrp !== null && (!Number.isFinite(product.mrp) || product.mrp <= product.price)) {
                errors.push("MRP must exceed selling price.");
            }

            if (!Number.isInteger(product.stock_quantity) || product.stock_quantity < 0) {
                errors.push("Stock must be 0 or more.");
            }

            if (!product.image_file && !product.image_path) {
                errors.push("Select an image file or provide an image URL.");
            }

            const key = `${(product.brand || "").toLowerCase()}\u0000${(product.name || "").toLowerCase()}`;
            const duplicate = products.some(existing =>
                existing.name?.trim().toLowerCase() === product.name?.toLowerCase() &&
                existing.brand?.trim().toLowerCase() === product.brand?.toLowerCase()
            ) || seen.has(key);

            seen.add(key);

            return { product, errors, duplicate };
        });
    }

    function renderBulkReview(results) {
        const body = document.querySelector("#secureBulkPreviewRows");
        if (!body) return;

        body.innerHTML = results.map(({ product, errors, duplicate }) => `
            <tr class="${errors.length ? "preview-invalid" : duplicate ? "preview-duplicate" : "preview-valid"}">
                <td><strong>${esc(product.name)}</strong><small>${esc(product.brand)}</small></td>
                <td>${esc(product.category)}</td>
                <td>${Number.isFinite(product.price) ? money.format(product.price) : "—"}
                    ${product.mrp ? `<small>MRP ${money.format(product.mrp)}</small>` : ""}
                </td>
                <td>${esc(Number.isInteger(product.stock_quantity) ? product.stock_quantity : "—")}</td>
                <td>${esc(product.image_file?.name || product.image_path || "Upload")}</td>
                <td>${esc(errors.join(" ") || (duplicate ? "Duplicate brand + name" : "Ready"))}</td>
            </tr>
        `).join("");

        document.querySelector("#secureBulkPreview").hidden = !results.length;
    }

    async function importCsvPreview() {
        const file = document.querySelector("#secureCsvFile").files[0];
        if (!file) throw new Error("Please choose a CSV file first.");

        const rows = parseCsv(await file.text());
        if (rows.length < 2) throw new Error("CSV requires a header and at least one product row.");

        const headers = rows[0].map(h => h.toLowerCase().replace(/[^a-z]/g, ""));
        const indexes = Object.fromEntries(headers.map((h, i) => [h, i]));

        const required = ["name", "brand", "price", "category", "stockquantity", "description"];
        const missing = required.filter(h => indexes[h] === undefined);

        if (missing.length) throw new Error(`Missing CSV columns: ${missing.join(", ")}`);

        const value = (row, key) => indexes[key] === undefined ? "" : (row[indexes[key]] || "").trim();

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
            feedback.textContent = "Please fix invalid rows and confirm any duplicates before saving.";
            return;
        }

        const uploaded = [];

        try {
            setMessage(feedback, "Saving batch to Supabase…");
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
                    image_path: imagePath || "assets/images/shubham-general-store-logo.svg",
                    variants: product.variants,
                    stock_quantity: product.stock_quantity,
                    is_published: Boolean(
                        product.is_published ?? document.querySelector("#securePublishBulk").checked
                    ),
                    created_by: currentUser.id,
                    updated_at: new Date().toISOString()
                });
            }

            const { error } = await client.from("products").insert(records);
            if (error) throw error;

            setMessage(feedback, `Successfully saved ${records.length} products to Supabase!`, true);
            await loadProducts();
            openBulk();
        } catch (error) {
            if (uploaded.length) {
                await client.storage.from("product-images").remove(uploaded);
            }
            setMessage(feedback, error.message || "Bulk save failed.");
        }
    }

    function openBulk() {
        editingProduct = null;
        document.querySelector("#secureProductForm").hidden = true;
        document.querySelector("#secureBulk").hidden = false;

        const rows = document.querySelector("#secureBulkRows");
        if (!rows.children.length) {
            for (let index = 0; index < 5; index += 1) {
                addSecureBulkRow();
            }
        }
    }

    // ── Authorization Gate (One Login, Single Source of Truth) ─────────────

    function showGateLoading() {
        if (adminAuthGate) adminAuthGate.hidden = false;
        if (gateLoadingCard) gateLoadingCard.hidden = false;
        if (gateGuestCard) gateGuestCard.hidden = true;
        if (gateDeniedCard) gateDeniedCard.hidden = true;
        if (secureAdmin) secureAdmin.hidden = true;
    }

    function showGateGuest() {
        if (adminAuthGate) adminAuthGate.hidden = false;
        if (gateLoadingCard) gateLoadingCard.hidden = true;
        if (gateGuestCard) gateGuestCard.hidden = false;
        if (gateDeniedCard) gateDeniedCard.hidden = true;
        if (secureAdmin) secureAdmin.hidden = true;
    }

    function showGateDenied(userEmail) {
        if (adminAuthGate) adminAuthGate.hidden = false;
        if (gateLoadingCard) gateLoadingCard.hidden = true;
        if (gateGuestCard) gateGuestCard.hidden = true;
        if (gateDeniedCard) gateDeniedCard.hidden = false;
        if (gateCustomerEmail) gateCustomerEmail.textContent = userEmail || "Authenticated User";
        if (secureAdmin) secureAdmin.hidden = true;
    }

    async function showSecureAdmin(user) {
        currentUser = user;
        if (adminAuthGate) adminAuthGate.hidden = true;
        if (secureAdmin) secureAdmin.hidden = false;

        const userLabel = document.querySelector("#adminUserLabel");
        if (userLabel) userLabel.textContent = `👑 ${user.email} (Owner)`;

        // Load both catalogues and orders
        await Promise.all([loadProducts(), loadAdminOrders()]);
    }

    async function verifyAdminAccess() {
        showGateLoading();

        if (!client) {
            showGateGuest();
            return;
        }

        try {
            const { data: { session }, error } = await client.auth.getSession();
            if (error || !session?.user) {
                showGateGuest();
                return;
            }

            // Verify with server RPC (is_store_admin)
            const isAdmin = await requireAdmin(session.user).catch(() => false);
            if (isAdmin) {
                await showSecureAdmin(session.user);
            } else {
                showGateDenied(session.user.email);
            }
        } catch (err) {
            console.error("verifyAdminAccess error:", err);
            showGateGuest();
        }
    }

    // ── Customer Orders Management ──────────────────────────────────────────

    async function loadAdminOrders() {
        if (!client) return;

        const container = document.querySelector("#adminOrdersContainer");
        if (container) {
            container.innerHTML = '<p class="loading-orders-msg">Loading customer orders from Supabase…</p>';
        }

        try {
            const { data, error } = await client
                .from("orders")
                .select("*")
                .order("created_at", { ascending: false });

            if (error) throw error;

            adminOrders = Array.isArray(data) ? data : [];
            updateOrderStats();
            renderAdminOrders();
        } catch (err) {
            console.error("loadAdminOrders error:", err);
            if (container) {
                container.innerHTML = `
                    <div class="empty-orders-card error">
                        <p>⚠️ Could not load customer orders: ${esc(err.message || "Network error")}</p>
                        <button type="button" class="button button-outline" id="retryAdminOrdersBtn">Retry Loading</button>
                    </div>
                `;
                document.querySelector("#retryAdminOrdersBtn")?.addEventListener("click", loadAdminOrders);
            }
        }
    }

    function updateOrderStats() {
        const total = adminOrders.length;
        const pending = adminOrders.filter(o => o.status === "Pending").length;
        const confirmed = adminOrders.filter(o => o.status === "Confirmed").length;
        const dispatched = adminOrders.filter(o => o.status === "Dispatched").length;
        const delivered = adminOrders.filter(o => o.status === "Delivered").length;

        const statTotal = document.querySelector("#statTotalOrders");
        const statPending = document.querySelector("#statPendingOrders");
        const statConfirmed = document.querySelector("#statConfirmedOrders");
        const statDispatched = document.querySelector("#statDispatchedOrders");
        const statDelivered = document.querySelector("#statDeliveredOrders");
        const countBadge = document.querySelector("#ordersCountBadge");

        if (statTotal) statTotal.textContent = total;
        if (statPending) statPending.textContent = pending;
        if (statConfirmed) statConfirmed.textContent = confirmed;
        if (statDispatched) statDispatched.textContent = dispatched;
        if (statDelivered) statDelivered.textContent = delivered;
        if (countBadge) countBadge.textContent = total;

        const prodBadge = document.querySelector("#productsCountBadge");
        if (prodBadge) prodBadge.textContent = products.length;
    }

    function filteredAdminOrders() {
        const query = (orderSearchQuery || "").trim().toLowerCase();
        return adminOrders.filter(order => {
            const matchesStatus = selectedOrderStatusFilter === "All" || order.status === selectedOrderStatusFilter;
            const searchField = `${order.id} ${order.customer_name} ${order.customer_phone} ${order.customer_city} ${order.customer_pincode} ${order.order_notes || ""}`.toLowerCase();
            const matchesQuery = !query || searchField.includes(query);
            return matchesStatus && matchesQuery;
        });
    }

    function renderAdminOrders() {
        const container = document.querySelector("#adminOrdersContainer");
        if (!container) return;

        const filtered = filteredAdminOrders();

        if (!filtered.length) {
            container.innerHTML = `
                <div class="empty-orders-card">
                    <p class="empty-mark">📦</p>
                    <h4>No Customer Orders Found</h4>
                    <p class="section-subtext">${adminOrders.length === 0 ? "No orders have been placed yet. When customers check out on WhatsApp, their orders are automatically recorded here." : "No orders match the current filter criteria."}</p>
                </div>
            `;
            return;
        }

        container.innerHTML = filtered.map(order => {
            const dateStr = order.created_at ? new Date(order.created_at).toLocaleString("en-IN", {
                dateStyle: "medium",
                timeStyle: "short"
            }) : "Recent";

            const shortId = order.id ? order.id.slice(0, 8).toUpperCase() : "ORDER";
            const items = Array.isArray(order.items) ? order.items : [];
            const cleanPhone = (order.customer_phone || "").replace(/\D/g, "");
            const waNumber = cleanPhone.startsWith("91") ? cleanPhone : `91${cleanPhone}`;

            return `
            <article class="admin-order-card" data-order-card-id="${esc(order.id)}">
                <div class="order-card-header">
                    <div class="order-header-meta">
                        <span class="order-ref-pill">#SHUB-${esc(shortId)}</span>
                        <span class="order-date">${esc(dateStr)}</span>
                    </div>
                    <div class="order-status-wrap">
                        <label class="status-select-label" for="status-${esc(order.id)}">Status:</label>
                        <select class="admin-status-dropdown status-${(order.status || 'pending').toLowerCase()}" data-order-status-select="${esc(order.id)}" id="status-${esc(order.id)}">
                            <option value="Pending" ${order.status === "Pending" ? "selected" : ""}>⏳ Pending</option>
                            <option value="Confirmed" ${order.status === "Confirmed" ? "selected" : ""}>✓ Confirmed</option>
                            <option value="Dispatched" ${order.status === "Dispatched" ? "selected" : ""}>🚚 Dispatched</option>
                            <option value="Delivered" ${order.status === "Delivered" ? "selected" : ""}>🎁 Delivered</option>
                            <option value="Cancelled" ${order.status === "Cancelled" ? "selected" : ""}>✕ Cancelled</option>
                        </select>
                    </div>
                </div>

                <div class="order-card-body">
                    <div class="customer-info-box">
                        <h4 class="customer-name">${esc(order.customer_name)}</h4>
                        <p class="customer-phone">
                            📱 <strong>${esc(order.customer_phone)}</strong>
                            <a href="https://wa.me/${esc(waNumber)}" target="_blank" rel="noopener" class="wa-contact-link" title="Contact customer on WhatsApp">Message Customer ↗</a>
                        </p>
                        <p class="customer-address">📍 ${esc(order.customer_address)}, ${esc(order.customer_city)} - ${esc(order.customer_pincode)}</p>
                        ${order.order_notes ? `<p class="customer-notes">📝 <em>Notes:</em> ${esc(order.order_notes)}</p>` : ""}
                    </div>

                    <div class="order-items-box">
                        <h5>Order Items (${items.reduce((acc, it) => acc + (it.quantity || 1), 0)})</h5>
                        <div class="order-items-table">
                            ${items.map(it => `
                                <div class="order-item-row">
                                    <span class="item-name">${esc(it.brand ? `${it.brand} - ` : "")}${esc(it.name || "Product")} ${it.shade ? `<small class="item-shade">(${esc(it.shade)})</small>` : ""}</span>
                                    <span class="item-qty">× ${esc(it.quantity || 1)}</span>
                                    <span class="item-price">${money.format((it.price || 0) * (it.quantity || 1))}</span>
                                </div>
                            `).join("")}
                        </div>
                        <div class="order-subtotal-row">
                            <strong>Subtotal Amount:</strong>
                            <strong class="order-total-price">${money.format(order.subtotal || 0)}</strong>
                        </div>
                    </div>
                </div>

                <div class="order-card-footer">
                    <button type="button" class="btn-delete-order" data-delete-order-id="${esc(order.id)}" title="Delete order record">Delete Order</button>
                </div>
            </article>
            `;
        }).join("");
    }

    async function handleUpdateOrderStatus(orderId, newStatus) {
        if (!client || !orderId) return;

        try {
            const { error } = await client
                .from("orders")
                .update({
                    status: newStatus,
                    updated_at: new Date().toISOString()
                })
                .eq("id", orderId);

            if (error) throw error;

            // Update in local memory
            const order = adminOrders.find(o => o.id === orderId);
            if (order) order.status = newStatus;

            updateOrderStats();

            // Visual confirmation
            const selectEl = document.querySelector(`select[data-order-status-select="${orderId}"]`);
            if (selectEl) {
                selectEl.className = `admin-status-dropdown status-${newStatus.toLowerCase()}`;
            }
        } catch (err) {
            console.error("Update status error:", err);
            alert(`Could not update order status: ${err.message}`);
            await loadAdminOrders();
        }
    }

    async function handleDeleteOrder(orderId) {
        if (!client || !orderId) return;
        if (!window.confirm("Are you sure you want to delete this order record? This action cannot be undone.")) return;

        try {
            const { error } = await client
                .from("orders")
                .delete()
                .eq("id", orderId);

            if (error) throw error;

            adminOrders = adminOrders.filter(o => o.id !== orderId);
            updateOrderStats();
            renderAdminOrders();
        } catch (err) {
            console.error("Delete order error:", err);
            alert(`Could not delete order: ${err.message}`);
        }
    }

    async function initialize() {
        if (!CONFIG.url || !CONFIG.anonKey || !window.supabase?.createClient) {
            configWarning.hidden = false;
            configWarning.textContent = "Supabase configuration is missing in supabase-config.js.";
            return;
        }

        client = window.supabase.createClient(CONFIG.url, CONFIG.anonKey);

        renderCategories();

        // Admin Tab Switching (Products vs Orders)
        const tabBtnProducts = document.querySelector("#adminTabBtnProducts");
        const tabBtnOrders = document.querySelector("#adminTabBtnOrders");
        const sectionProducts = document.querySelector("#adminSectionProducts");
        const sectionOrders = document.querySelector("#adminSectionOrders");

        if (tabBtnProducts && tabBtnOrders && sectionProducts && sectionOrders) {
            tabBtnProducts.addEventListener("click", () => {
                tabBtnProducts.classList.add("active");
                tabBtnOrders.classList.remove("active");
                sectionProducts.hidden = false;
                sectionOrders.hidden = true;
            });

            tabBtnOrders.addEventListener("click", () => {
                tabBtnOrders.classList.add("active");
                tabBtnProducts.classList.remove("active");
                sectionOrders.hidden = false;
                sectionProducts.hidden = true;
                loadAdminOrders();
            });
        }

        // Sign Out buttons
        const handleSignOut = () => {
            if (client) {
                client.auth.signOut().then(() => {
                    currentUser = null;
                    showGateGuest();
                });
            }
        };
        document.querySelector("#signOutButton")?.addEventListener("click", handleSignOut);
        document.querySelector("#gateSignOutBtn")?.addEventListener("click", handleSignOut);

        // Orders tools listeners
        document.querySelector("#refreshAdminOrdersBtn")?.addEventListener("click", loadAdminOrders);

        document.querySelector("#adminOrderSearchInput")?.addEventListener("input", (e) => {
            orderSearchQuery = e.currentTarget.value;
            renderAdminOrders();
        });

        document.querySelector("#adminOrderStatusFilter")?.addEventListener("change", (e) => {
            selectedOrderStatusFilter = e.currentTarget.value;
            renderAdminOrders();
        });

        // Orders container event delegation (status change & delete)
        document.querySelector("#adminOrdersContainer")?.addEventListener("change", (e) => {
            const select = e.target.closest("[data-order-status-select]");
            if (select) {
                const orderId = select.dataset.orderStatusSelect;
                const newStatus = select.value;
                handleUpdateOrderStatus(orderId, newStatus);
            }
        });

        document.querySelector("#adminOrdersContainer")?.addEventListener("click", (e) => {
            const delBtn = e.target.closest("[data-delete-order-id]");
            if (delBtn) {
                const orderId = delBtn.dataset.deleteOrderId;
                handleDeleteOrder(orderId);
            }
        });

        document.querySelector("#showSingleProduct")?.addEventListener("click", () => showSingleForm());
        document.querySelector("#showBulkProducts")?.addEventListener("click", openBulk);

        document.querySelector("#cancelProductEdit")?.addEventListener("click", () => {
            document.querySelector("#secureProductForm").hidden = true;
            editingProduct = null;
        });

        document.querySelector("#cancelProductEditTop")?.addEventListener("click", () => {
            document.querySelector("#secureProductForm").hidden = true;
            editingProduct = null;
        });

        document.querySelector("#secureProductForm")?.addEventListener("submit", saveSingleProduct);

        // Image input preview listener
        const imageFileInput = document.querySelector('#secureProductForm input[name="image"]');
        const imageUrlInput = document.querySelector('#secureProductForm input[name="imageUrlInput"]');

        if (imageFileInput) {
            imageFileInput.addEventListener("change", (e) => {
                const file = e.currentTarget.files[0];
                const previewBox = document.querySelector("#adminFormImagePreview");
                const previewImg = document.querySelector("#adminFormPreviewImg");
                if (file && previewBox && previewImg) {
                    previewImg.src = URL.createObjectURL(file);
                    previewBox.hidden = false;
                }
            });
        }

        if (imageUrlInput) {
            imageUrlInput.addEventListener("input", (e) => {
                const url = e.currentTarget.value.trim();
                const previewBox = document.querySelector("#adminFormImagePreview");
                const previewImg = document.querySelector("#adminFormPreviewImg");
                if (url && previewBox && previewImg) {
                    previewImg.src = resolveImageUrl(url);
                    previewBox.hidden = false;
                }
            });
        }

        document.querySelector("#secureAddBulkRow")?.addEventListener("click", () => addSecureBulkRow());

        document.querySelector("#secureBulkRows")?.addEventListener("click", event => {
            const remove = event.target.closest("[data-remove-secure-row]");
            if (remove) {
                remove.closest(".secure-bulk-row")?.remove();
            }
        });

        document.querySelector("#secureReviewBulk")?.addEventListener("click", async () => {
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
                    (item.duplicate && !document.querySelector("#secureAllowDuplicates").checked)
                );

                document.querySelector("#secureSaveBulk").disabled = blocked || !validation.length;

                setMessage(
                    feedback,
                    blocked
                        ? "Please fix highlighted row issues or allow duplicates."
                        : `${validation.length} product rows are valid and ready to save.`,
                    !blocked
                );
            } catch (error) {
                setMessage(feedback, error.message);
            }
        });

        document.querySelector("#secureSaveBulk")?.addEventListener("click", saveSecureBulk);

        // Product search & filter listeners
        document.querySelector("#adminSearchInput")?.addEventListener("input", (e) => {
            searchQuery = e.currentTarget.value;
            renderProducts();
        });

        document.querySelector("#adminCategoryFilter")?.addEventListener("change", (e) => {
            selectedCategoryFilter = e.currentTarget.value;
            renderProducts();
        });

        document.querySelector("#adminStatusFilter")?.addEventListener("change", (e) => {
            selectedStatusFilter = e.currentTarget.value;
            renderProducts();
        });

        // Product action delegation (edit, toggle, delete)
        document.querySelector("#secureProductList")?.addEventListener("click", async event => {
            const edit = event.target.closest("[data-edit-id]");
            const toggle = event.target.closest("[data-toggle-id]");
            const remove = event.target.closest("[data-delete-id]");

            if (edit) {
                const product = products.find(item => item.id === edit.dataset.editId);
                if (product) showSingleForm(product);
            }

            if (toggle) {
                const product = products.find(item => item.id === toggle.dataset.toggleId);
                if (!product) return;

                const newPublished = toggle.dataset.published === "true";

                const { error } = await client.from("products")
                    .update({
                        is_published: newPublished,
                        updated_at: new Date().toISOString()
                    })
                    .eq("id", product.id);

                if (error) {
                    alert(error.message);
                } else {
                    await loadProducts();
                }
            }

            if (remove && window.confirm("Are you sure you want to permanently delete this product?")) {
                const product = products.find(item => item.id === remove.dataset.deleteId);

                const { error } = await client.from("products")
                    .delete()
                    .eq("id", remove.dataset.deleteId);

                if (error) {
                    alert(error.message);
                    return;
                }

                // If image was stored in Supabase Storage, delete it cleanly
                if (product?.image_path &&
                    !/^https?:\/\//i.test(product.image_path) &&
                    !product.image_path.startsWith("assets/")) {
                    try {
                        await client.storage.from("product-images").remove([product.image_path]);
                    } catch (_) {}
                }

                await loadProducts();
            }
        });

        // Initial verification of admin authorization
        await verifyAdminAccess();

        // Listen for auth state changes (e.g. login/logout in other tabs or OAuth callback)
        client.auth.onAuthStateChange((_event, session) => {
            if (!session?.user) {
                currentUser = null;
                showGateGuest();
            } else {
                verifyAdminAccess();
            }
        });
    }

    initialize();
})();
