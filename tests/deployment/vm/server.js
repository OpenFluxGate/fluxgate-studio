const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const identity = fs.readFileSync(path.join(__dirname, ".next", "BUILD_ID"), "utf8").trim();
http.createServer((request, response) => {
  if (request.url === "/fixture-identity") {
    response.end(identity);
  } else if (request.url === "/login" || request.url === "/") {
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end("<!doctype html><title>FluxGate Studio</title><h1>FluxGate Studio</h1>");
  } else {
    response.writeHead(404).end();
  }
}).listen(3000, "127.0.0.1");
