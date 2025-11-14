# MuRP - Backend Documentation & API Specification

This document outlines the required backend services, data models, and API endpoints to support the MuRP frontend application. The goal is to provide a clear roadmap for backend developers to build a scalable and secure server that mirrors the frontend's logic.

## 1. Authentication

The frontend simulates a user selection login. A production backend should implement a robust authentication system, such as JWT (JSON Web Tokens).

**Workflow:**
1.  A user submits credentials (e.g., email/password) to a `POST /api/auth/login` endpoint.
2.  The server validates the credentials and, if successful, returns a JWT.
3.  The frontend stores this token securely (e.g., in an HttpOnly cookie).
4.  For all subsequent authenticated requests, the frontend sends the JWT in the `Authorization` header.
    ```
    Authorization: Bearer <your_jwt_token>
    ```
5.  The server validates the token on every protected endpoint.

**User Roles & Permissions:**
The API must enforce role-based access control (RBAC) based on the `role` field in the User model ('Admin', 'Manager', 'Staff'). For example, creating a Purchase Order should be restricted to 'Admin' users.

---

## 2. Data Models (Database Schema)

These models are based on `types.ts`. The schema should be designed with appropriate relations (e.g., foreign keys).

**`Users` Table**
| Column | Type | Notes |
|---|---|---|
| `id` | UUID / String | Primary Key |
| `name` | String | |
| `email` | String | Unique |
| `password_hash` | String | |
| `role` | Enum('Admin', 'Manager', 'Staff') | |
| `department` | Enum(...) | |

**`InventoryItems` Table**
| Column | Type | Notes |
|---|---|---|
| `sku` | String | Primary Key, Unique |
| `name` | String | |
| `category` | String | |
| `stock` | Integer | |
| `onOrder` | Integer | |
| `reorderPoint` | Integer | |
| `vendorId` | String | Foreign Key -> Vendors.id |
| `moq` | Integer | Minimum Order Quantity |

**`Vendors` Table**
| Column | Type | Notes |
|---|---|---|
| `id` | String | Primary Key |
| `name` | String | |
| `contactEmails` | JSON / Array of Strings | |
| ... | ... | |

**`BillsOfMaterials` (BOMs) Table**
| Column | Type | Notes |
|---|---|---|
| `id` | String | Primary Key |
| `finishedSku` | String | Foreign Key -> InventoryItems.sku |
| `name` | String | |
| `components` | JSON | `[{ "sku": "...", "quantity": 1 }]` |
| `artwork` | JSON | `[{ "id": "...", "fileName": "...", "revision": 1, "url": "...", "folderId": "..." }]` |
| `packaging` | JSON | `{"bagType": "...", "labelType": "..."}` |
| `barcode` | String | Nullable |

**`ArtworkFolders` Table**
| Column | Type | Notes |
|---|---|---|
| `id` | String | Primary Key |
| `name` | String | |

**`PurchaseOrders` Table**
| Column | Type | Notes |
|---|---|---|
| `id` | String | Primary Key |
| `vendorId` | String | Foreign Key -> Vendors.id |
| `status`| Enum('Pending', 'Submitted', 'Fulfilled') | |
| `createdAt` | DateTime | |
| `items` | JSON | `[{ "sku": "...", "quantity": 1, "price": 10.50 }]` |
| ... | ... | |

**`InternalRequisitions` Table**
| Column | Type | Notes |
|---|---|---|
| `id` | String | Primary Key |
| `requesterId` | String | Foreign Key -> Users.id |
| `status`| Enum('Pending', 'Approved', ...) | |
| ... | ... | |

*(Other models like `BuildOrders`, `Watchlist` should be created similarly)*

---

## 3. API Endpoints

All endpoints should be prefixed with `/api/v1`.

### Inventory
- **`GET /inventory`**: Get all inventory items.
- **`GET /inventory/:sku`**: Get a single inventory item.

### Bills of Materials (BOMs)
- **`GET /boms`**: Get all BOMs.
- **`PUT /boms/:id`**: Update a BOM (e.g., for editing artwork, packaging). This is an atomic update.
    - **Request Body**: The entire updated BOM object.

### Artwork & Folders
- **`GET /artwork/folders`**: Get all artwork folders.
- **`POST /artwork/folders`**: Create a new artwork folder.
    - **Request Body**: `{ "name": "New Folder Name" }`
- **`PUT /artwork/move`**: Move an artwork to a new folder. This would likely be part of the `PUT /boms/:id` call by updating the `folderId` within the `artwork` array.

### Purchase Orders (POs)
- **`GET /purchase-orders`**: Get all POs.
- **`POST /purchase-orders`**: Create a new PO.
    - **Logic**: This action must also update the `onOrder` quantity for the relevant `InventoryItems`.
    - **Request Body**: `{ "vendorId": "...", "items": [...], "requisitionIds": [...] }`

### Requisitions
- **`GET /requisitions`**: Get requisitions. The endpoint should filter based on the authenticated user's role and department.
- **`POST /requisitions`**: Create a new requisition.
- **`POST /requisitions/:id/approve`**: Approve a requisition. (Admin/Manager only)
- **`POST /requisitions/:id/reject`**: Reject a requisition. (Admin/Manager only)

### Build Orders
- **`GET /build-orders`**: Get all build orders.
- **`POST /build-orders`**: Create a new build order.
- **`POST /build-orders/:id/complete`**: Mark a build order as complete.
    - **Logic**: This is a critical transaction. It must:
        1.  Decrement stock for all components listed in the BOM.
        2.  Increment stock for the finished good.
        3.  The entire operation must be atomic.

### Users (Admin Only)
- **`GET /users`**: Get all users.
- **`POST /users/invite`**: Invite a new user.
- **`PUT /users/:id`**: Update a user's role or department.
- **`DELETE /users/:id`**: Delete a user.

---

## 4. Key Business Logic on Server

The frontend contains complex business logic that should be replicated on the backend to ensure data integrity.

- **Buildability Service (`services/buildabilityService.ts`)**: The logic for calculating how many units of a product can be built should be implemented as a backend service or a complex database query/view. This is crucial for the Dashboard.
- **Forecasting (`services/forecastingService.ts`)**: The demand forecasting logic should live on the backend. It can be a scheduled job that pre-calculates forecasts.
- **PO Generation from Requisitions**: The aggregation of approved requisitions into vendor-specific POs should be a backend process to ensure reliability.

---

## 5. Gemini API Integration

To protect the `API_KEY`, the frontend should **never** call the Gemini API directly.

- **Create a secure endpoint**: `POST /api/ai/query`
- **Workflow**:
    1.  The frontend sends a request to `/api/ai/query` with a payload identifying the type of query (e.g., `inventory-qa`, `regulatory-scan`) and any necessary context (e.g., user question, product ingredients).
    2.  The backend receives this request.
    3.  The backend server constructs the final prompt using the stored prompt templates.
    4.  The server makes the call to the Google Gemini API using the securely stored API key.
    5.  The server returns the AI's response to the frontend.
- **Configuration**: The AI model and prompt templates should be stored in the database and be configurable via the Admin UI, matching the settings implemented on the frontend.
