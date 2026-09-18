# Inventory Management System

An inventory management system consisting of a REST API built with **Node.js + Express + PostgreSQL** and a web interface for daily use.

The main priorities are:

* **Stock quantities must always be accurate**
* **Every stock change must have a transaction history**

---

## Requirements

| Requirement | Version | Notes                                                                        |
| ----------- | ------- | ---------------------------------------------------------------------------- |
| Node.js     | 20.19+  | Enforced via `engines`; required by `@neon/config` and `@neon/env`          |
| PostgreSQL  | 13+     | A local installation **or** a Neon project reachable through `DATABASE_URL`  |

Check your versions:

```bash
node --version
psql --version
```

---

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Create a `.env` file in the project root:

```env
PORT=3000

PGHOST=localhost
PGPORT=5432
PGDATABASE=inventory
PGUSER=postgres
PGPASSWORD=your_postgres_password

DATABASE_SSL=false
DB_POOL_MAX=10

LOW_STOCK_THRESHOLD=5

CORS_ORIGIN=*
```

Replace the values with the PostgreSQL credentials configured on your machine.

There are two ways to point the application at a database:

| Mode                 | How                                                                        |
| -------------------- | -------------------------------------------------------------------------- |
| Local PostgreSQL     | Fill in the `PG*` variables above                                        |
| Neon (or any hosted) | Set `DATABASE_URL`; it **takes precedence over every `PG*` variable**     |

```env
# Neon example — use the pooled host and keep sslmode=require
DATABASE_URL=postgresql://user:password@ep-xxx-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
```

> **Important:** Do not share your `.env` file with other people or commit it to Git. The `.env` file contains your database credentials.

If the project includes `.env.example`, you can copy it first:

**Windows CMD:**

```cmd
copy .env.example .env
```

**PowerShell:**

```powershell
Copy-Item .env.example .env
```

Then edit `.env` with your PostgreSQL credentials.

### 3. Create the database

Make sure PostgreSQL is running, then create the database:

```bash
createdb inventory
```

If `createdb` is not available in your PATH, create a database named `inventory` using **pgAdmin** or another PostgreSQL client.

> Using Neon or another hosted PostgreSQL? The database already exists, so skip this step and go
> straight to step 4 — `npm run db:reset` will create the tables in the database behind
> `DATABASE_URL`.

### 4. Initialize the database

Run:

```bash
npm run db:reset
```

This creates the database tables, indexes, triggers, views, and sample data.

Alternatively, you can run the SQL files directly:

```bash
psql -d inventory -f db/schema.sql
psql -d inventory -f db/seed.sql
```

### 5. Start the server

```bash
npm run dev      # development: restarts on file changes (node --watch)
```

For a production-style start without the file watcher:

```bash
npm start        # node src/server.js
```

The application will be available at:

| URL                            | Description                    |
| ------------------------------ | ------------------------------ |
| `http://localhost:3000/`       | Web application                |
| `http://localhost:3000/docs/`  | Swagger API documentation      |
| `http://localhost:3000/health` | API and database health status |

---

## Environment Variables

The application reads all configuration from `.env` (see `src/config.js`).

Example:

```env
PORT=3000

PGHOST=localhost
PGPORT=5432
PGDATABASE=inventory
PGUSER=postgres
PGPASSWORD=your_postgres_password

DATABASE_SSL=false
DB_POOL_MAX=10

LOW_STOCK_THRESHOLD=5

CORS_ORIGIN=*
```

### Variable Description

| Variable              | Default       | Description                                                                   |
| --------------------- | ------------- | ------------------------------------------------------------------------------ |
| `PORT`                | `3000`        | Port used by the Express server                                                |
| `DATABASE_URL`        | —             | Full connection string. **Used instead of all `PG*` variables when set**        |
| `PGHOST`              | `localhost`   | PostgreSQL host                                                                |
| `PGPORT`              | `5432`        | PostgreSQL port                                                                |
| `PGDATABASE`          | `inventory`   | PostgreSQL database name                                                       |
| `PGUSER`              | `postgres`    | PostgreSQL username                                                            |
| `PGPASSWORD`          | empty         | PostgreSQL password                                                            |
| `DATABASE_SSL`        | `false`       | Set `true` to connect with SSL (not needed if `DATABASE_URL` carries `sslmode`) |
| `DB_POOL_MAX`         | `10`          | Maximum number of connections in the pool                                      |
| `LOW_STOCK_THRESHOLD` | `5`           | Default warning level used when a product does not define its own              |
| `CORS_ORIGIN`         | `*`           | Allowed origin(s), comma-separated; `*` allows every origin                    |
| `NODE_ENV`            | `development` | Environment label reported by the app                                          |

For a local PostgreSQL installation, the most common configuration is:

```env
PGHOST=localhost
PGPORT=5432
PGDATABASE=inventory
PGUSER=postgres
PGPASSWORD=your_password
```

---

## Using Neon (optional)

The application can run against a [Neon](https://neon.com) database instead of a local PostgreSQL
server. The project ships with the tooling for it:

| File / package            | Purpose                                                                    |
| ------------------------- | -------------------------------------------------------------------------- |
| `neon.ts`                 | Config-as-Code policy (`@neon/config`) describing the project and branches  |
| `@neon/env` (`neon-env`)  | Resolves the branch and injects `DATABASE_URL` / `DATABASE_URL_UNPOOLED`    |
| `.neon/`                  | Context file written by the Neon CLI (gitignored)                           |

### 1. Authenticate and link the project

```bash
npm i -g neon        # Neon CLI
neon login           # or: export NEON_API_KEY=<api_key>
neon link            # binds this folder to a Neon project/branch, writes .neon
```

### 2. Run the API with Neon credentials injected

```bash
npx neon-env run -- npm run dev
```

`neon-env` loads `neon.ts`, resolves the branch (`--branch`, `NEON_BRANCH` / `NEON_BRANCH_ID`, or the
branch recorded in `.neon`), and spawns the command with `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, and
`NEON_BRANCH` injected on top of the inherited environment. Print the values instead of spawning a
process with:

```bash
npx neon-env export                 # dotenv KEY=value lines
npx neon-env export --format json
```

### Notes

* `DATABASE_URL` takes precedence over every `PG*` variable, so the local `PG*` settings in `.env`
  are ignored as soon as `DATABASE_URL` is present.
* Neon requires TLS: keep `sslmode=require` in the connection string, or set `DATABASE_SSL=true`.
* Use the **pooled** host (the one containing `-pooler`) for the API and keep `DB_POOL_MAX` low —
  the pooler already multiplexes connections, so a large client-side pool adds double pooling.
* Create the schema once against Neon with `npm run db:reset`, which runs `db/schema.sql` and
  `db/seed.sql` through the same `DATABASE_URL`.

---

## Documentation

| File                 | Description                                                             |
| -------------------- | ----------------------------------------------------------------------- |
| `docs/ER-DIAGRAM.md` | Database structure, relationships, and design decisions                 |
| `docs/API.md`        | Complete API documentation with request/response examples               |
| `docs/openapi.yaml`  | Swagger 3.0 specification that can be imported into Postman or Insomnia |

---

## Available Endpoints

| Method | Path                             | Description                                                        |
| ------ | -------------------------------- | ------------------------------------------------------------------ |
| GET    | `/api`                           | API index: version, endpoint list, and low-stock threshold         |
| POST   | `/api/products`                  | Create a new product                                               |
| GET    | `/api/products`                  | Search, filter, sort, and paginate products                        |
| GET    | `/api/products/low-stock`        | Get products below the warning stock level (default: 5)            |
| GET    | `/api/products/:id`              | Get a single product                                               |
| PATCH  | `/api/products/:id`              | Update product information (stock quantity cannot be changed here) |
| DELETE | `/api/products/:id`              | Deactivate a product or permanently delete it with `?force=true`   |
| GET    | `/api/products/:id/transactions` | Get transaction history for a specific product                     |
| PATCH  | `/api/stock/adjust`              | Increase or decrease stock, such as `+10` or `-5`                  |
| PATCH  | `/api/stock/bulk-adjust`         | Adjust stock for multiple products at once                         |
| GET    | `/api/stock/transactions`        | View system-wide stock transaction history with filters            |
| GET    | `/api/categories`                | Get product categories                                             |
| POST   | `/api/categories`                | Create a category                                                  |
| PATCH  | `/api/categories/:id`            | Update a category                                                  |
| DELETE | `/api/categories/:id`            | Delete a category that has no products                             |
| GET    | `/api/summary`                   | Get summary statistics for the dashboard                           |
| GET    | `/health`                        | Check system health                                                |

---

## Why Stock Cannot Become Negative

The system has three layers of protection.

### 1. API Validation

Before updating stock, the API checks that the resulting quantity is greater than or equal to zero.

If there is insufficient stock, the API returns:

```text
409 INSUFFICIENT_STOCK
```

The response also indicates how much stock is missing.

### 2. Concurrency Protection

The system uses:

```sql
SELECT ... FOR UPDATE
```

to lock the product row during the transaction.

If two requests attempt to reduce the same stock at the same time, the second request waits for the first transaction to finish and then calculates the new quantity using the latest stock value.

### 3. Database Constraint

The database also has:

```sql
CHECK (stock_quantity >= 0)
```

This is the final layer of protection.

Even if another piece of code attempts to write an invalid negative quantity directly to the database, PostgreSQL will reject it.

### Atomic Stock Updates

Updating the stock quantity and creating the transaction history happen inside the **same database transaction**.

If any step fails, the entire transaction is rolled back.

This ensures that:

* Stock quantity remains consistent
* Transaction history remains consistent
* A failed stock adjustment does not partially update the database

For the same reason, `PATCH /api/products/:id` does not allow `stock_quantity` to be modified directly.

---

## Project Structure

```text
inventory-api/
│
├── .env.example                # Template for .env (safe to commit)
├── neon.ts                     # Neon Config-as-Code policy (@neon/config)
│
├── db/
│   ├── schema.sql              # Tables, indexes, triggers, and views
│   └── seed.sql                # Sample data: 3 categories and 9 products
│
├── docs/
│   ├── API.md                 # Complete API documentation
│   ├── ER-DIAGRAM.md          # Database structure and relationships
│   ├── er-diagram.svg         # ER diagram
│   ├── openapi.yaml           # Swagger 3.0 specification
│   └── index.html             # Swagger UI
│
├── public/                    # Web application
│   ├── index.html
│   ├── styles.css
│   └── app.js
│
├── scripts/
│   └── setup-db.js            # npm run db:setup / npm run db:reset
│
├── src/
│   ├── config.js              # Centralized .env configuration
│   ├── db.js                  # Connection pool + withTransaction
│   ├── app.js                 # Express application
│   ├── server.js              # Server entry point + graceful shutdown
│   │
│   ├── lib/
│   │   ├── errors.js          # ApiError, error handler, PostgreSQL errors
│   │   ├── validate.js        # Input validation
│   │   └── serialize.js       # Standard response formatting
│   │
│   ├── middleware/
│   │   └── index.js           # CORS + request logging
│   │
│   └── routes/
│       ├── products.routes.js
│       ├── stock.routes.js
│       ├── categories.routes.js
│       └── summary.routes.js
│
└── tests/
    └── validate.test.js       # npm test — no database required
```

---

## Web Application

After starting the server, open:

```text
http://localhost:3000/
```

No additional frontend installation or build step is required.

### Low Stock Alert

The top section immediately displays products that are below their warning stock level.

Clicking a product name opens the stock adjustment interface.

### Product Table

The product table supports:

* Product search
* Category filtering
* Sorting by stock quantity
* Pagination
* Visual stock-level indicators

### Stock Adjustment Drawer

The stock adjustment interface displays:

* Current stock
* Adjustment quantity
* New stock quantity
* Real-time validation

If the requested adjustment would result in negative stock, the save button is disabled and the maximum available quantity is displayed.

### Transaction History

Users can view stock movement history:

* For the entire system
* For a specific product
* By transaction type
* By date range

### Mobile Support

The web interface is responsive.

On smaller screens, the product table automatically changes into a card-based layout.

---

## Testing

Run the validation tests with:

```bash
npm test                 # runs: node --test tests/*.test.js
```

These tests cover input validation such as:

* Integers
* Decimal numbers
* Enum values
* Pagination
* Invalid input values

The validation tests do **not** require a database connection.

### Test the Main API Flow with cURL

The examples use **Windows CMD** line continuation (`^`). In bash, replace `^` with `\`.

#### Create a product

```cmd
curl -X POST http://localhost:3000/api/products ^
  -H "Content-Type: application/json" ^
  -d "{\"sku\":\"TEST-001\",\"name\":\"Test Product\",\"category_id\":1,\"cost_price\":100,\"stock_quantity\":3}"
```

#### Attempt to remove more stock than available

```cmd
curl -X PATCH http://localhost:3000/api/stock/adjust ^
  -H "Content-Type: application/json" ^
  -d "{\"product_id\":1,\"quantity\":-9999,\"reason\":\"Test\"}"
```

Expected result:

```text
409 INSUFFICIENT_STOCK
```

The stock quantity should remain unchanged.

#### View low-stock products

```cmd
curl http://localhost:3000/api/products/low-stock
```

---

## Authentication

The system currently does **not** include authentication because authentication was not specified as part of the requirements.

The `created_by` field is therefore currently provided through the request body.

For production use, it is recommended to:

* Use JWT or session-based authentication
* Get `created_by` from the authenticated user instead of the request body
* Add role-based access control
* Restrict sensitive inventory operations based on user permissions

---

## Quick Setup Summary

For a new machine, the complete setup is:

```bash
# 1. Install dependencies
npm install

# 2. Create your environment file, then fill in the database values
copy .env.example .env          # PowerShell: Copy-Item .env.example .env

# 3. Create the tables, indexes, triggers, views, and sample data
npm run db:reset

# 4. Start the development server
npm run dev
```

If you use Neon instead of a local PostgreSQL server, steps 2–3 become
`neon-env run -- npm run db:reset` with `DATABASE_URL` set — see
[Using Neon](#using-neon-optional).

Then open:

```text
http://localhost:3000/
```

Swagger API documentation:

```text
http://localhost:3000/docs/
```

Health check:

```text
http://localhost:3000/health
```
