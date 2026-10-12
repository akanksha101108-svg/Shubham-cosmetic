# Shubham General Store

A responsive, beginner-friendly cosmetics storefront built with plain HTML, CSS and JavaScript. It has a sample multi-brand catalog, search, category filters, sorting, product details, a cart and a customer-initiated WhatsApp enquiry flow. No dependencies or build step are needed.

## Run locally

In VS Code, open this project folder and select `index.html` in Explorer. To preview inside VS Code, install Microsoft's free **Live Preview** extension, then open `index.html` and choose **Show Preview**. You can also open `index.html` directly in your browser; this static site needs no build step, package installation, or local server. Product photography and fonts load from Unsplash and Google Fonts, so those assets need an internet connection.

## Change the store name

Edit `name` in the `STORE_CONFIG` object at the top of `products.js`. The header, footer, browser title, and checkout label update from that one setting. The custom SVG shopping-bag logo at `assets/images/shubham-general-store-logo.svg` is used in the header, footer, and as the browser favicon.

## Update products and prices

For a browser-based demo, choose **Open demo product manager** in the footer to add, edit, publish, unpublish, or delete products without editing the layout. You can add products one at a time or import 10+ product rows from CSV. New records are drafts and do not appear in the catalogue until explicitly published. **OWNER ENTERED** means entered by the owner, not independently verified. To update the starter catalog directly, edit objects in `products.js` inside `window.DEMO_PRODUCTS`.

Each product uses `id`, `brand`, `name`, `category`, `description`, `price`, `image`, `stockQuantity`, `stockStatus`, `isDemo`, `published`, and `needsCategoryReview`. `originalPrice` and `shades` are optional. `stockStatus` is derived from `stockQuantity`: zero means out of stock. Quantities are not connected to a live inventory service.

- Prices are numbers in Indian rupees, without a currency symbol.
- `originalPrice`, when present, is shown as a demo comparison price; omit it when there is no original price to display.
- Categories must match the current list in `script.js`: `Makeup`, `Skincare`, `Haircare`, `Nail Care`, `Beauty Accessories`, `Bangles`, `Fragrance`, or `Women’s Care`.
- For a local product photo, create `assets/images/` beside `index.html`, place the image there, and set `image` to a relative path such as `assets/images/rose-lipstick.jpg`. Supported image extensions are JPG, PNG, WebP, GIF, and AVIF. You can also use an Unsplash photo ID or an HTTPS image URL.
- The current catalog, price comparisons, popularity values, and review are explicitly demo content. Confirm product details, pricing, stock, and any reviews before using this as a live store.

Example product entry:

```js
{
	id: 15,
	brand: "Your brand",
	name: "Your product name",
	category: "Nail Care",
	description: "Description supplied and checked by the store owner.",
	price: 0,
	stockQuantity: 0,
	stockStatus: "out-of-stock",
	image: "assets/images/your-product.jpg",
	shades: ["Shade one", "Shade two"],
	isDemo: false,
	published: false,
	needsCategoryReview: false
}
```

Replace the example values with details you have verified before displaying the product to customers. Starter entries default to `isDemo: true`; set `isDemo: false` only for a listing you have entered and checked. The site labels it owner-entered and still asks you to verify it before sale; that label is not independent verification. Never leave the example price or out-of-stock value in a real listing.

Step by step: open the manager from the footer, expand **Add multiple products in rows**, fill the 10 visible rows, and choose **Add Another Product** for more. Press **Preview & Validate All**, fix row errors/duplicate warnings, then press **Save All Products**. Keep publishing unchecked to save drafts; publish only after verifying the actual product details. For CSV, use the linked template and the same preview/save workflow.

## Bulk product manager (browser-local)

Open **Open demo product manager** in the footer, then expand **Add multiple products in rows**. Ten blank rows are created by default. Add more with **Add Another Product**. Each row includes product name, brand, category, selling price, optional MRP, description, image upload/path, variant, and stock quantity.

1. Fill actual product details in the ten rows. Use **Add Another Product** for additional rows.
2. Upload a photo per row (up to 3 MB, resized locally), or enter a path/URL.
3. Select **Preview & Validate All**. Missing details, invalid price/MRP/stock, category/image errors, and duplicate brand+name rows appear before saving. Enable **Allow duplicate name + brand** only when duplicate listings are intentional.
4. Keep publishing unchecked to save drafts. Check **Publish these products after saving** only after verifying the data. **Save All Products** saves every valid previewed row together; inventory quantity is used to derive availability and cap cart quantities.
5. For CSV, download [products-import-template.csv](products-import-template.csv). Required columns are `name`, `brand`, `price`, `category`, `description`, `image`, and `stockQuantity`; optional columns are `mrp`, `shades`, and `published`. Only `published=true` requests publication. Imports use the same preview, duplicate check, and Save All step.

Changes are stored in this browser's `localStorage` only; they do not sync to another device and may be lost if storage is cleared or quota is reached. Uploaded photo data also consumes this limited browser storage. There is no login, backend, or persistent database, so this is not permanent shared inventory. Anyone using the browser can change its catalog. Starter samples stay hidden. Existing `Lips` items are preserved as unpublished category-review records; assign one of the current categories before publishing.

Browser-saved manager changes override the starter `products.js` catalog on that browser. After editing the file directly, open the demo manager and press **Reset to products.js** to discard its local edits and reload the source catalog. Confirm the reset because it removes browser-saved product changes.

## Production architecture (not implemented)

A real admin panel needs authenticated users, server-side role checks and validation, persistent product data, server-controlled inventory updates, and protected order records. One low-operations option is Supabase (PostgreSQL, Auth, and Storage with restrictive Row Level Security); another is a custom API with PostgreSQL and managed authentication. Either option may have hosting or usage charges. Review and approve the provider and deployment plan before adding any service. Keep privileged keys on the server, recalculate prices and stock server-side, use atomic inventory updates, and restrict customer order access and retention.

## Configure WhatsApp

In `products.js`, update only `STORE_CONFIG.whatsappNumber` with the store owner's WhatsApp number. It is currently set to `919250203173`. Use country code `91` followed by the 10-digit mobile number, digits only: no `+`, spaces, or dashes. This is the only place to configure the recipient.

The customer must add items, review the summary, complete the required delivery fields, and press **Order on WhatsApp**. The website opens an official `wa.me` click-to-chat link with the message prefilled; the customer still chooses whether to send it. The item subtotal is calculated from the current cart. Delivery charges and the final payable total are not calculated by this site and are explicitly marked pending confirmation. No payment-method, order-date, or order-reference field exists in this checkout. This static website does not save orders, verify stock, or confirm delivery of a WhatsApp message. The store owner must confirm availability, delivery charges, and the final amount directly with the customer.

## Demo-only features

The catalog, brand/product claims, comparison prices, popularity ordering, stock statuses, photo IDs, and review text are sample content. Cart state is in memory for the current page; product-manager changes may persist only in this browser. Checkout details are used to create the WhatsApp draft and are not sent to or stored by this website. No order is confirmed or saved when WhatsApp opens. Do not enter sensitive customer or business information into this demo.

## Before public launch

- Replace sample products, stock, prices, discounts, imagery, and review text with information you have permission to use and have verified.
- Enter the store owner's real WhatsApp number in the documented `STORE_CONFIG.whatsappNumber` setting and test it with the owner.
- Approve and provision a production backend before implementing a real admin: authentication and role checks, server-side product/order validation, persistent storage, secure image storage, and server-controlled inventory updates.
- Keep privileged credentials on the server. Protect customer order data with least-privilege access, secure transport, a retention/deletion policy, and backups.
- Decide how delivery charges, payment, taxes, returns, privacy terms, customer support, and fulfillment will work; implement and test those policies before taking real orders.
- Deploy over HTTPS and test the production domain, mobile layouts, accessibility, security controls, and the full order lifecycle.

No database, authentication provider, hosting service, or paid tool has been added. Choose and approve a production provider and deployment plan before adding one.
