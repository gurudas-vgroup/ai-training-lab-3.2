const { adminRequest } = require("./adminClient");

// Unwraps a GraphQL connection ({ edges: [{ node }] }) into a plain array of nodes
function nodes(connection) {
  return connection ? connection.edges.map((e) => e.node) : [];
}

// Prints a labeled section header followed by a console.table of the given rows
function printTable(label, rows) {
  console.log(`\n===== ${label} =====`);
  if (!rows || rows.length === 0) {
    console.log("(no rows)");
    return;
  }
  console.table(rows);
}

// Runs one query, converts the result to flat rows via toRows, and prints
// it as a table. Prints the GraphQL error message instead if the query fails
// (e.g. missing scope or Protected Customer Data approval).
async function run(label, query, toRows) {
  try {
    const data = await adminRequest(query);
    printTable(label, toRows(data));
  } catch (err) {
    console.log(`\n===== ${label} =====`);
    console.log("ERROR:", err.message);
  }
}

async function main() {
  // Basic shop metadata — sanity check that auth is working
  await run(
    "Shop info",
    `query {
      shop {
        name
        email
        myshopifyDomain
        currencyCode
        plan { displayName }
      }
    }`,
    (data) => [
      {
        name: data.shop.name,
        email: data.shop.email,
        domain: data.shop.myshopifyDomain,
        currency: data.shop.currencyCode,
        plan: data.shop.plan.displayName,
      },
    ]
  );

  // Customers plus their full order history and contact details.
  // Requires read_customers + read_orders, and Protected Customer Data approval.
  await run(
    "Customers + full order history + contact details",
    `query {
      customers(first: 10) {
        edges {
          node {
            id
            firstName
            lastName
            email
            phone
            numberOfOrders
            amountSpent { amount currencyCode }
            orders(first: 25) {
              edges {
                node {
                  name
                  createdAt
                  displayFinancialStatus
                  displayFulfillmentStatus
                  totalPriceSet { shopMoney { amount currencyCode } }
                }
              }
            }
          }
        }
      }
    }`,
    (data) => {
      const rows = [];
      // Flatten to one row per order; customers with no orders get a single placeholder row
      for (const customer of nodes(data.customers)) {
        const orders = nodes(customer.orders);
        if (orders.length === 0) {
          rows.push({
            customer: `${customer.firstName ?? ""} ${customer.lastName ?? ""}`.trim(),
            email: customer.email,
            phone: customer.phone,
            numberOfOrders: customer.numberOfOrders,
            amountSpent: `${customer.amountSpent.amount} ${customer.amountSpent.currencyCode}`,
            order: "-",
            orderDate: "-",
            financialStatus: "-",
            fulfillmentStatus: "-",
            orderTotal: "-",
          });
        } else {
          for (const order of orders) {
            rows.push({
              customer: `${customer.firstName ?? ""} ${customer.lastName ?? ""}`.trim(),
              email: customer.email,
              phone: customer.phone,
              numberOfOrders: customer.numberOfOrders,
              amountSpent: `${customer.amountSpent.amount} ${customer.amountSpent.currencyCode}`,
              order: order.name,
              orderDate: order.createdAt,
              financialStatus: order.displayFinancialStatus,
              fulfillmentStatus: order.displayFulfillmentStatus,
              orderTotal: `${order.totalPriceSet.shopMoney.amount} ${order.totalPriceSet.shopMoney.currencyCode}`,
            });
          }
        }
      }
      return rows;
    }
  );

  // Products with their variants and each variant's legacy inventory count.
  // Requires read_products.
  await run(
    "Products + variants (basic inventory field)",
    `query {
      products(first: 25) {
        edges {
          node {
            title
            status
            totalInventory
            variants(first: 10) {
              edges {
                node {
                  title
                  sku
                  price
                  inventoryQuantity
                }
              }
            }
          }
        }
      }
    }`,
    (data) => {
      const rows = [];
      // Flatten to one row per variant
      for (const product of nodes(data.products)) {
        for (const variant of nodes(product.variants)) {
          rows.push({
            product: product.title,
            status: product.status,
            totalInventory: product.totalInventory,
            variant: variant.title,
            sku: variant.sku,
            price: variant.price,
            variantInventoryQty: variant.inventoryQuantity,
          });
        }
      }
      return rows;
    }
  );

  // Existing draft orders. Requires write_draft_orders (implies read) and
  // Protected Customer Data approval for the linked customer's email.
  await run(
    "Draft orders",
    `query {
      draftOrders(first: 25) {
        edges {
          node {
            name
            status
            createdAt
            totalPriceSet { shopMoney { amount currencyCode } }
            customer { email }
          }
        }
      }
    }`,
    (data) =>
      nodes(data.draftOrders).map((d) => ({
        name: d.name,
        status: d.status,
        createdAt: d.createdAt,
        total: `${d.totalPriceSet.shopMoney.amount} ${d.totalPriceSet.shopMoney.currencyCode}`,
        customerEmail: d.customer ? d.customer.email : "-",
      }))
  );

  // Store locations. Requires read_locations.
  await run(
    "Locations",
    `query {
      locations(first: 10) {
        edges { node { name isActive } }
      }
    }`,
    (data) =>
      nodes(data.locations).map((l) => ({
        name: l.name,
        isActive: l.isActive,
      }))
  );

  // Per-location inventory levels for each product variant. Requires read_inventory
  // (and read_locations for the location name).
  await run(
    "Inventory levels across locations",
    `query {
      productVariants(first: 25) {
        edges {
          node {
            sku
            inventoryItem {
              inventoryLevels(first: 5) {
                edges {
                  node {
                    location { name }
                    quantities(names: ["available", "on_hand", "committed"]) {
                      name
                      quantity
                    }
                  }
                }
              }
            }
          }
        }
      }
    }`,
    (data) => {
      const rows = [];
      // Flatten to one row per (variant, location) inventory level
      for (const variant of nodes(data.productVariants)) {
        for (const level of nodes(variant.inventoryItem.inventoryLevels)) {
          // quantities comes back as [{ name, quantity }, ...]; turn it into { available, on_hand, committed }
          const qty = Object.fromEntries(level.quantities.map((q) => [q.name, q.quantity]));
          rows.push({
            sku: variant.sku ?? "-",
            location: level.location.name,
            available: qty.available,
            onHand: qty.on_hand,
            committed: qty.committed,
          });
        }
      }
      return rows;
    }
  );
}

main();
