const { adminRequest } = require("./adminClient");

function nodes(connection) {
  return connection ? connection.edges.map((e) => e.node) : [];
}

function printTable(label, rows) {
  console.log(`\n===== ${label} =====`);
  if (!rows || rows.length === 0) {
    console.log("(no rows)");
    return;
  }
  console.table(rows);
}

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
      for (const variant of nodes(data.productVariants)) {
        for (const level of nodes(variant.inventoryItem.inventoryLevels)) {
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
