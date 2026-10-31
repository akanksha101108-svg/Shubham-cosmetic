# Shubham Cosmetic & General Store — E-Commerce Website

A modern, responsive, and secure cosmetics e-commerce storefront with Supabase database integration, Google OAuth customer authentication, and WhatsApp direct checkout.

---

## 🌟 Key Features

1. **Luxury Pink & White Aesthetics**:
   - Modern beauty brand design with Playfair Display and DM Sans typography.
   - Smooth hover micro-animations and clean responsive layouts.
   - Elegant category cards and promotional sections.

2. **8 Product Categories**:
   - Makeup
   - Skincare
   - Haircare
   - Nail Care
   - Beauty Accessories
   - Bangles
   - Fragrance
   - Women's Care

3. **Supabase Integration & RLS Security**:
   - **Database Products**: Published products load directly from the Supabase database.
   - **Row Level Security (RLS)**: Public visitors can only view published items. Only verified store administrators can add, update, delete, or publish products.
   - **Customer Profiles**: Logged-in customers' personal information (Name, Mobile, Address, City, PIN Code) is stored securely under strict RLS policies — each user can only read and update their own profile.
   - **Storage Bucket**: Product photos are uploaded securely to the `product-images` Supabase Storage bucket.

4. **Customer Login & Profile Management**:
   - One-click Google Login powered by Supabase Authentication.
   - Customer account profile drawer to view and update delivery details (Name, Phone, Address, City, PIN Code).
   - Saved details automatically autofill at checkout.

5. **Shopping Bag & WhatsApp Direct Checkout**:
   - Variant and shade selection with color swatches.
   - Real-time price calculation and quantity management.
   - One-click WhatsApp handoff to `+91 9250203173` with an itemized bill, customer delivery details, and order notes.

6. **Dedicated Admin Panel (`admin.html`)**:
   - Secure email & password login with server-side admin verification (`admin_users` table).
   - Real-time catalog stats: Total Products, Published (Live), Drafts (Hidden), Out of Stock.
   - Add/edit products with image upload to Supabase Storage or external image URL.
   - Instant 1-click Publish / Unpublish toggles.
   - Bulk entry and CSV batch import with automatic validation.
   - Live search and category filters.

---

## 📁 Project Structure

```
├── index.html                   # Main customer-facing storefront
├── style.css                    # Storefront stylesheet (Pink & White theme)
├── script.js                    # Storefront application logic & Supabase client
├── admin.html                   # Dedicated store administration dashboard
├── admin.css                    # Admin dashboard stylesheet
├── admin.js                     # Admin dashboard logic, Auth & product management
├── products.js                  # Store configuration & starter beauty products
├── supabase-config.js           # Supabase project URL & public anon key
├── products-import-template.csv # Blank CSV template for bulk product import
├── supabase/
│   └── schema.sql               # PostgreSQL tables, functions & RLS security policies
└── assets/
    ├── images/
    │   └── shubham-general-store-logo.svg
    ├── mars-black.jpg
    ├── mars-mauve.jpg
    └── mars-pink.jpg
```

---

## 🚀 Supabase Setup (One-Time Step)

To enable the new `customer_profiles` table and updated category constraints:

1. Open your [Supabase Dashboard](https://supabase.com/dashboard).
2. Go to the **SQL Editor** in the left sidebar.
3. Open `supabase/schema.sql` from this project, copy its contents, paste them into the SQL editor, and click **Run**.
4. To make an admin account:
   - Go to **Authentication -> Users** and note your admin user's UUID.
   - Run in SQL Editor:
     ```sql
     insert into public.admin_users (user_id) values ('PASTE-AUTH-USER-UUID-HERE');
     ```

---

## 📞 WhatsApp Number Configuration

The WhatsApp number is configured in `products.js`:
```js
window.STORE_CONFIG = {
  name: "Shubham Cosmetic & General Store",
  whatsappNumber: "919250203173"
};
```
Format: Country code `91` followed by the 10-digit mobile number (digits only, no spaces or dashes).

---

## 🧪 How to Test Locally

1. Open `index.html` in your web browser (or use VS Code Live Server / Live Preview).
2. **Browse & Filter**: Click category pills to filter products.
3. **Product Details**: Click on any product or "Quick View" to select shades and view details.
4. **Shopping Bag**: Click "Add to Bag", change quantities in the Bag drawer, and see real-time price updates.
5. **Checkout**: Enter customer details, tap "Order on WhatsApp", and verify WhatsApp opens with the pre-filled message.
6. **Customer Login**: Click "Login" in the top right to sign in with Google and view your Profile drawer.
7. **Admin Panel**: Visit `admin.html`, sign in with your Supabase admin credentials, and test adding, editing, or publishing products.
