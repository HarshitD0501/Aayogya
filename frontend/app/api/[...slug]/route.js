import { NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_ORIGIN || "http://127.0.0.1:8000";

export async function GET(request, { params }) {
  return handleRequest(request, params, "GET");
}

export async function POST(request, { params }) {
  return handleRequest(request, params, "POST");
}

export async function PUT(request, { params }) {
  return handleRequest(request, params, "PUT");
}

export async function DELETE(request, { params }) {
  return handleRequest(request, params, "DELETE");
}

async function handleRequest(request, params, method) {
  const resolvedParams = await params;
  const path = "/" + (resolvedParams?.slug || []).join("/");
  const url = new URL(request.url);
  const targetUrl = `${BACKEND_URL}/api${path}${url.search}`;

  // Forward to real FastAPI backend
  try {
    const isHeavyEndpoint =
      path.includes("/upload") ||
      path.includes("/chat") ||
      path.includes("/trigger");
    const timeoutMs = isHeavyEndpoint ? 90000 : 20000;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const headers = new Headers(request.headers);
    headers.delete("host");

    let body = undefined;
    if (method !== "GET" && method !== "HEAD") {
      try {
        body = await request.arrayBuffer();
      } catch {
        body = undefined;
      }
    }

    const res = await fetch(targetUrl, {
      method,
      headers,
      body,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const data = await res.arrayBuffer();
    return new NextResponse(data, {
      status: res.status,
      headers: {
        "Content-Type":
          res.headers.get("Content-Type") || "application/json",
      },
    });
  } catch (err) {
    const isTimeout = err.name === "AbortError";
    console.error(`[Proxy] Backend at ${BACKEND_URL} unreachable for ${path}: ${err.message}`);
    return NextResponse.json(
      {
        detail: isTimeout
          ? "The server took too long to respond. Please try again."
          : `Backend server at ${BACKEND_URL} is unreachable. Ensure the backend is running.`,
      },
      { status: isTimeout ? 504 : 503 }
    );
  }
}
