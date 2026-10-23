# Aayogya frontend

This Next.js frontend uses the visual design and PWA screens from
[Aushadh-AI](https://github.com/HarshitD0501/Aushadh-AI) at commit
`777336d157f6d209635de6ef33e8f53e0304ca0d`. The upstream MIT notice is
in `AUSHADH_LICENSE.txt`.

The original Aayogya authentication, patient dashboard, caregiver dashboard,
assistant, and `/api/*` and `/agent/*` proxy routes remain connected to this
project's backend. The new `/search`, `/scan`, `/stores`, `/history`, and
`/prescriptions/[id]` screens use Aushadh-AI's `/api/v1/*` contract. This
project's backend does not yet implement that contract, so those screens show
service errors or empty states until an adapter or API is added. They never
replace medicine facts, OCR results, stores, reminders, or call statuses with
demo fixtures.

Run `npm ci`, then `npm run dev` from this directory. Start the FastAPI backend
on port 8000 and set `BACKEND_ORIGIN` in `.env.local` if it runs elsewhere.
Run `npm run build` to verify the production frontend.
