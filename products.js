window.STORE_CONFIG = {
  name: "Shubham General Store",
  whatsappNumber: "919250203173"
};

window.DEMO_PRODUCTS = [
  {
    id: 1,
    brand: "Swiss Beauty",
    name: "HD Matte Lipstick",
    category: "Lips",
    stockStatus: "in-stock",
    price: 299,
    originalPrice: 399,
    popularity: 98,
    image: "photo-1586495777744-4413f21062fa",
    shades: ["Bare Rose", "Berry Muse", "Coral Bloom"],
    description: "A sample matte lip colour for a comfortable, polished everyday look. Shade names, description and pricing are illustrative demo data."
  },
  {
    id: 2,
    brand: "Maybelline",
    name: "Fit Me Fresh Tint",
    category: "Face",
    stockStatus: "in-stock",
    price: 549,
    originalPrice: 699,
    popularity: 95,
    image: "photo-1512496015851-a90fb38ba796",
    shades: ["Light", "Natural", "Medium"],
    description: "A sample lightweight complexion tint with a fresh-looking finish. Product details and prices are illustrative and not verified."
  },
  {
    id: 3,
    brand: "Lakmé",
    name: "Absolute Eyeconic Kajal",
    category: "Eyes",
    stockStatus: "in-stock",
    price: 275,
    originalPrice: 350,
    popularity: 92,
    image: "photo-1512496015851-a90fb38ba796",
    shades: ["Classic Black", "Deep Brown"],
    description: "A demo eye pencil listing for the everyday beauty edit. Shade options, product details and prices are sample content only."
  },
  {
    id: 4,
    brand: "Faces Canada",
    name: "Ultime Pro Makeup Fixer",
    category: "Makeup",
    stockStatus: "in-stock",
    price: 499,
    originalPrice: 625,
    popularity: 90,
    image: "photo-1596462502278-27bfdc403348",
    description: "A sample setting-spray listing for your makeup bag. Details and prices are demo data, not a verified product offer."
  },
  {
    id: 5,
    brand: "Colorbar",
    name: "Perfect Match Primer",
    category: "Face",
    stockStatus: "in-stock",
    price: 699,
    originalPrice: 875,
    popularity: 87,
    image: "photo-1522335789203-aabd1fc54bc9",
    description: "A demo primer listing with a smooth-feel finish in mind. Product claims, description and prices have not been verified."
  },
  {
    id: 6,
    brand: "Plum",
    name: "Green Tea Renewed Clarity Night Gel",
    category: "Skincare",
    stockStatus: "in-stock",
    price: 575,
    originalPrice: 675,
    popularity: 89,
    image: "photo-1601049541289-9b1b7bbbfe19",
    description: "A sample skincare listing for the evening ritual. Product suitability, details and prices are demo content only."
  },
  {
    id: 7,
    brand: "Swiss Beauty",
    name: "Bold Eyes Mascara",
    category: "Eyes",
    stockStatus: "in-stock",
    price: 349,
    originalPrice: 449,
    popularity: 85,
    image: "photo-1512496015851-a90fb38ba796",
    description: "A demo mascara listing for a defined eye look. Product details and sample pricing are not verified."
  },
  {
    id: 8,
    brand: "Maybelline",
    name: "Color Sensational Creamy Matte",
    category: "Lips",
    stockStatus: "in-stock",
    price: 399,
    originalPrice: 499,
    popularity: 93,
    image: "photo-1586495777744-4413f21062fa",
    shades: ["Nude Nuance", "Touch of Spice", "Red Siren"],
    description: "A sample lipstick listing in a selection of demo shades. Availability, product details and prices are not verified."
  },
  {
    id: 9,
    brand: "Lakmé",
    name: "9to5 Primer + Matte Powder Foundation",
    category: "Face",
    stockStatus: "in-stock",
    price: 525,
    originalPrice: 699,
    popularity: 84,
    image: "photo-1522335789203-aabd1fc54bc9",
    shades: ["Ivory", "Silk", "Honey"],
    description: "A sample compact foundation listing. Shade references and all product information are illustrative demo content."
  },
  {
    id: 10,
    brand: "Colorbar",
    name: "Nail Lacquer",
    category: "Nails",
    stockStatus: "in-stock",
    price: 199,
    originalPrice: 250,
    popularity: 76,
    image: "photo-1604654894610-df63bc536371",
    shades: ["Petal Pink", "Cherry Red", "Mauve Moment"],
    description: "A demo nail-colour listing with a few sample shade names. Product details and prices are not verified."
  },
  {
    id: 11,
    brand: "PAC",
    name: "Everyday Blending Brush",
    category: "Brushes",
    stockStatus: "in-stock",
    price: 450,
    popularity: 73,
    image: "photo-1522335789203-aabd1fc54bc9",
    description: "A sample makeup brush listing for your beauty routine. Listing details and price are demo data only."
  },
  {
    id: 12,
    brand: "The Face Shop",
    name: "Rice Water Bright Cleansing Foam",
    category: "Skincare",
    stockStatus: "in-stock",
    price: 399,
    originalPrice: 499,
    popularity: 80,
    image: "photo-1571781926291-c477ebfd024b",
    description: "A demo cleanser listing for a simple skincare ritual. Product details, suitability and prices are illustrative only."
  },
  {
    id: 13,
    brand: "Swiss Beauty",
    name: "Makeup Blender Sponge",
    category: "Beauty Accessories",
    stockStatus: "out-of-stock",
    price: 199,
    originalPrice: 249,
    popularity: 70,
    image: "photo-1596462502278-27bfdc403348",
    description: "A sample beauty accessory listing. Product availability, details and prices are demo content only."
  },
  {
    id: 14,
    brand: "Faces Canada",
    name: "Weightless Matte Foundation",
    category: "Makeup",
    stockStatus: "in-stock",
    price: 599,
    originalPrice: 749,
    popularity: 78,
    image: "photo-1512496015851-a90fb38ba796",
    shades: ["Porcelain", "Warm Beige", "Golden"],
    description: "A sample foundation listing with illustrative shades. Product details and prices have not been independently verified."
  }
].map((product) => ({
  ...product,
  category: product.category === "Lips" ? "Lips" : ({ Eyes: "Makeup", Face: "Makeup", Nails: "Nail Care", Brushes: "Beauty Accessories" }[product.category] || product.category),
  isDemo: product.isDemo ?? true,
  published: false,
  needsCategoryReview: product.category === "Lips"
}));
