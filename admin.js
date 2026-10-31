(() => {
    const CATEGORIES = ["Makeup", "Skincare", "Haircare", "Nail Care", "Beauty Accessories", "Bangles", "Fragrance", "Women's Care"];
    const CONFIG = window.SUPABASE_CONFIG || {};
    const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

    const loginPanel = document.querySelector("#loginPanel");
    const secureAdmin = document.querySelector("#secureAdmin");
    const configWarning = document.querySelector("#configWarning");

    let client = null;
    let currentUser = null;
    let products = [];
    let editingProduct = null;
    let previewRows = [];

    // Filters & Search
    let searchQuery = "";
    let selectedCategoryFilter = "All";
    let selectedStatusFilter = "All";

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

    // ── Admin Authentication: Google OAuth ──────────────────────────────────

    function handleAdminGoogleLogin() {
        const feedback = document.querySelector("#loginFeedback");
        if (!client) {
            setMessage(feedback, "⚠️ Cannot connect to the server. The Supabase project may be paused.");
            return;
        }

        setMessage(feedback, "Redirecting to Google sign-in…");

        const redirectTo = window.location.origin + window.location.pathname;
        client.auth.signInWithOAuth({
            provider: "google",
            options: {
                queryParams: { prompt: "select_account" },
                redirectTo
            }
        }).catch((err) => {
            console.error("Admin Google OAuth error:", err);
            const msg = err?.message || "";
            if (msg.toLowerCase().includes("fetch") || msg.toLowerCase().includes("network")) {
                setMessage(feedback, "⚠️ Cannot reach the server. Your Supabase project may be paused — resume it at app.supabase.com.");
            } else {
                setMessage(feedback, `Google sign-in failed: ${msg}`);
            }
        });
    }

    // ── Admin Authentication: Email OTP ──────────────────────────────────────

    let adminOtpEmail = "";

    async function handleAdminOtpRequest(event) {
        event.preventDefault();
        const feedback = document.querySelector("#loginFeedback");
        const emailInput = document.querySelector("#adminEmail");
        const btn = document.querySelector("#adminSendOtpBtn");
        const email = emailInput?.value.trim();

        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            setMessage(feedback, "Please enter a valid email address.");
            return;
        }

        if (!client) {
            setMessage(feedback, "⚠️ Cannot connect to the server. The Supabase project may be paused.");
            return;
        }

        setMessage(feedback, "");
        if (btn) { btn.disabled = true; btn.querySelector("span").textContent = "Sending…"; }

        try {
            const { error } = await client.auth.signInWithOtp({
                email,
                options: {
                    shouldCreateUser: true,
                    emailRedirectTo: window.location.origin + window.location.pathname
                }
            });

            if (error) throw error;

            adminOtpEmail = email;

            // Show Step 2
            const target = document.querySelector("#adminOtpEmailTarget");
            if (target) target.textContent = email;
            document.querySelector("#adminOtpRequestForm").hidden = true;
            document.querySelector("#adminOtpVerifyForm").hidden = false;
            setMessage(feedback, "✅ Verification code sent! Check your email inbox (and spam folder).");
        } catch (err) {
            console.error("Admin OTP send error:", err);
            const msg = err?.message || "";
            if (msg.toLowerCase().includes("fetch") || msg.toLowerCase().includes("network") || msg.toLowerCase().includes("failed to fetch")) {
                setMessage(feedback, "⚠️ Cannot reach the server. Your Supabase project may be paused — resume it at app.supabase.com.");
            } else if (msg.toLowerCase().includes("rate") || msg.toLowerCase().includes("limit")) {
                setMessage(feedback, "⚠️ Email rate limit reached. Supabase Free Tier allows ~2 emails/hour. Please wait a few minutes or use Google Sign-In instead.");
            } else {
                setMessage(feedback, `Could not send code: ${msg || "Unknown error. Please try again."}`);
            }
        } finally {
            if (btn) { btn.disabled = false; btn.querySelector("span").textContent = "Send Verification Code"; }
        }
    }

    async function handleAdminOtpVerify(event) {
        event.preventDefault();
        const feedback = document.querySelector("#loginFeedback");
        const token = document.querySelector("#adminOtpCode")?.value.trim();
        const btn = document.querySelector("#adminVerifyOtpBtn");

        if (!token || token.length !== 6) {
            setMessage(feedback, "Please enter the 6-digit code from your email.");
            return;
        }

        setMessage(feedback, "");
        if (btn) { btn.disabled = true; btn.querySelector("span").textContent = "Verifying…"; }

        try {
            const { data, error } = await client.auth.verifyOtp({
                email: adminOtpEmail,
                token,
                type: "email"
            });

            if (error) throw error;

            // OTP verified — handleAuthenticatedUser will check admin status
            await handleAuthenticatedUser(data.user);
        } catch (err) {
            console.error("Admin OTP verify error:", err);
            setMessage(feedback, `Verification failed: ${err?.message || "Invalid or expired code. Please try again."}`);
        } finally {
            if (btn) { btn.disabled = false; btn.querySelector("span").textContent = "Verify & Sign In"; }
        }
    }

    function resetAdminOtpForm() {
        adminOtpEmail = "";
        const requestForm = document.querySelector("#adminOtpRequestForm");
        const verifyForm = document.querySelector("#adminOtpVerifyForm");
        const otpInput = document.querySelector("#adminOtpCode");
        const feedback = document.querySelector("#loginFeedback");
        if (requestForm) requestForm.hidden = false;
        if (verifyForm) verifyForm.hidden = true;
        if (otpInput) otpInput.value = "";
        if (feedback) feedback.textContent = "";
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
            setMessage(feedback, error.message || "Admin authorization could not be verified.");
            await client.auth.signOut();
            currentUser = null;
            resetAdminOtpForm();
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

        // Admin auth: Google OAuth button
        document.querySelector("#adminGoogleBtn")?.addEventListener("click", handleAdminGoogleLogin);

        // Admin auth: Email OTP request form
        document.querySelector("#adminOtpRequestForm")?.addEventListener("submit", handleAdminOtpRequest);

        // Admin auth: Email OTP verify form
        document.querySelector("#adminOtpVerifyForm")?.addEventListener("submit", handleAdminOtpVerify);

        // Admin auth: Resend OTP
        document.querySelector("#adminResendOtp")?.addEventListener("click", async () => {
            const feedback = document.querySelector("#loginFeedback");
            if (!adminOtpEmail || !client) return;
            try {
                await client.auth.signInWithOtp({ email: adminOtpEmail, options: { shouldCreateUser: true, emailRedirectTo: window.location.origin + window.location.pathname } });
                setMessage(feedback, "✅ New code sent! Check your inbox and spam folder.", true);
            } catch (err) {
                setMessage(feedback, `Could not resend: ${err?.message || "Please try again."}`);
            }
        });

        // Admin auth: Change email (go back to Step 1)
        document.querySelector("#adminChangeEmail")?.addEventListener("click", () => {
            resetAdminOtpForm();
        });

        document.querySelector("#signOutButton")?.addEventListener("click", () =>
            client.auth.signOut().then(() => location.reload())
        );

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

        // Check active session
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
