# Frontend · GYM CONTROL

React + TypeScript + Vite (RTL / فارسی).

## Setup

```powershell
cd frontend
npm install
```

## Run

```powershell
npm run dev
```

## Tests

```powershell
npm test
```

قبل از commit/push باید سبز باشند. جزئیات: `docs/guides/testing.md`

App: http://127.0.0.1:5173  
Requests to `/api/*` are proxied to the FastAPI backend on port `8000`.

## Layout

```text
frontend/src/
├── app/            # (reserved) app shell wiring
├── components/     # shared UI
├── features/       # feature modules (athlete, receptionist, manager, ...)
├── lib/            # api helpers, formatters
├── types/          # shared TypeScript types
└── styles/         # optional extra styles
```

پروتوتایپ HTML فعلی در ریشهٔ ریپو مرجع طراحی Ocean Dark است.
