# Asset Master Matcher

Plain HTML/CSS/JS single-page app: upload an asset Excel/CSV **or** paste/load a JSON request body → POST to the matching API → download a flattened results workbook.

## Quick start

1. Serve the folder over HTTP (preferred; don’t open as `file://` when calling the API):
   ```bash
   npx serve .
   # or: python -m http.server 8080
   ```
2. (Optional) Enable **Demo mode** in Settings (gear icon) to run the full UI without a backend.
3. Choose input on Step 1:
   - **Excel / CSV** — upload a file, or use **Download input template**
   - **JSON** — paste a request body or load a `.json` file, then **Review JSON**
4. Review the preview → **Process matching**.
5. On the results screen, **Download Excel** for the flattened output, or **Start new request** to upload/paste another batch.

## Set the API URL

Defaults to the local Function (`func start`):

```js
const DEFAULT_API_URL = "http://localhost:7071/api/asset_master_match";
```

To point at another host (e.g. deployed), open **Settings** (gear in the top bar) or change `DEFAULT_API_URL` in `app.js`. Optional headers (e.g. `Authorization`) live in Settings too; overrides persist in `localStorage`.

## Batching

The API accepts at most **50 assets per request** (total across all customers). The UI groups assets by `CustomerId` and splits them into as many requests as needed (a customer is kept in one request when it fits; a customer with more than 50 assets is split). Results are merged in input order. **Settings → Max assets per request** can lower the size (1–50). Each request times out after **3 minutes**.

## CORS

The UI and the Function run on different origins (e.g. `http://localhost:3000` vs `http://localhost:7071`), so the browser blocks the response unless the Function allows the UI origin. Serve this folder over HTTP (not `file://`).

- **Local:** add to `Azure_function/local.settings.json` and restart `func start` (use the port you serve the UI on):

  ```json
  "Host": {
    "CORS": "http://localhost:3000,http://127.0.0.1:3000",
    "CORSCredentials": false
  }
  ```

- **Deployed:** configure CORS on the Function App (Portal → API → CORS) with the deployed UI URL.

Use **Demo mode** to exercise parse → preview → Excel export without a backend.

## JSON input

Switch to the **JSON** tab and paste (or load a `.json` file with) the same body the API accepts — `{ "requests": [ { "CustomerId", "assets": [...] } ] }` or legacy `{ "CustomerId", "assets": [...] }`. Rows with a missing `AssetName`, a missing/invalid `CustomerId`, or non-numeric id/cost fields are listed as validation issues and skipped. Extra asset fields are sent as-is.

## Input columns (Excel)

`CustomerId`, `AssetName`, `AssetDescription`, `AssetType`, `PlantLocation`, `AssetClass`, `AssetClassId`, `Category`, `CategoryId`, `Cost`, `Count`

Headers are matched case/space/underscore-insensitively. Rows are grouped by `CustomerId` into `{ requests: [{ CustomerId, assets: [...] }] }`.

## Files

| File | Role |
|---|---|
| `index.html` | Markup + CDN scripts (SheetJS, ExcelJS, FileSaver) |
| `styles.css` | Single light theme, layout, components |
| `app.js` | Parse, validate, API, flatten, Excel export, UI state |
| `ui.js` | Presentation-only polish (glass scroll, video play/pause, toasts, etc.) |
| `assetcues-logo.png` | AssetCues brand logo in the top bar |
| `assetcues-animation.webm` | Looping brand animation shown during Process |
| `README.md` | This guide |
| `.gitignore` | Ignores `node_modules`, local Excel/CSV, env files, IDE junk |

## Deploy (later)

This is a static site: publish at least:

- `index.html`
- `app.js`
- `ui.js`
- `styles.css`
- `assetcues-logo.png`
- `assetcues-animation.webm`
- `README.md` (optional)

to any static host (Azure Static Web Apps, App Service static site, Netlify, etc.). No build step.

After deploy, set the production API URL in the UI Settings (or change `DEFAULT_API_URL` in `app.js`) and allow that UI origin in the Function App CORS settings.
