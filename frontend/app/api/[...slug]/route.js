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

  const contentLength = parseInt(request.headers.get("content-length") || "0", 10);
  if (contentLength > 10 * 1024 * 1024) {
    return NextResponse.json(
      { detail: "Payload exceeds maximum permitted size of 10 MB." },
      { status: 413 }
    );
  }

  // Forward to real FastAPI backend
  try {
    const isHeavyEndpoint =
      path.includes("/upload") ||
      path.includes("/chat") ||
      path.includes("/trigger");
    const timeoutMs = isHeavyEndpoint ? 90000 : 45000;
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(new DOMException(`Upstream request timed out after ${timeoutMs}ms`, "TimeoutError")),
      timeoutMs
    );

    // Forward client abort to upstream fetch
    if (request.signal) {
      if (request.signal.aborted) {
        controller.abort(request.signal.reason || new DOMException("Client aborted request", "AbortError"));
      } else {
        request.signal.addEventListener(
          "abort",
          () => controller.abort(request.signal.reason || new DOMException("Client aborted request", "AbortError")),
          { once: true }
        );
      }
    }

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
    const isAbort =
      err?.name === "AbortError" ||
      err?.name === "TimeoutError" ||
      err?.message?.toLowerCase().includes("abort");
    const isTimeout =
      err?.name === "TimeoutError" ||
      controller?.signal?.reason?.name === "TimeoutError";

    if (isAbort && !isTimeout) {
      // Client cancelled/aborted request (e.g. navigation, tab change)
      return new NextResponse(null, { status: 499 });
    }

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
