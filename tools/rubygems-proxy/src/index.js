// The entry point for your application.
//
// Use this fetch event listener to define your main request handling logic. It could be
// used to route based on the request properties (such as method or path), send
// the request to a backend, make completely new requests, and/or generate
// synthetic responses.

addEventListener("fetch", (event) => event.respondWith(handleRequest(event)));

const backend = "index.rubygems.org";

async function handlePreflightRequest(event) {
  const response = new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400"
    }
  });
  return response;
}
async function handleRequest(event) {

  if (event.request.method === "OPTIONS" &&
      event.request.headers.get("Origin") !== null &&
      event.request.headers.get("Access-Control-Request-Method") !== null &&
      event.request.headers.get("Access-Control-Request-Headers") !== null) {
    return handlePreflightRequest(event);
  }

  const url = new URL(event.request.url);
  url.hostname = "index.rubygems.org";
  url.port = "443";

  const req = new Request(url, event.request);
  console.log(req);
  const response = await fetch(req, {
    backend,
    headers: {
      "user-agent": "irb.wasm (rubygems-proxy)",
    }
  });
  console.log(response);
  response.headers.set("Access-Control-Allow-Origin", "*");
  return response;
}
