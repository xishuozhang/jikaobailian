const crypto = require("crypto");
const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const sha1 = (values) => crypto.createHash("sha1").update(values.sort().join(""), "utf8").digest("hex");
const getToken = () => `${process.env.VIRTUAL_PAYMENT_PUSH_TOKEN || ""}`.trim();
const parseBody = (body) => {
  if (!body) return {};
  if (typeof body === "object") return body;
  try { return JSON.parse(body); } catch (error) { return {}; }
};

exports.main = async (event = {}) => {
  const query = event.queryStringParameters || event.query || {};
  const token = getToken();
  if (!token) return { statusCode: 500, body: "VIRTUAL_PAYMENT_PUSH_TOKEN is not configured" };
  const signature = query.signature || query.msg_signature || "";
  const timestamp = query.timestamp || "";
  const nonce = query.nonce || "";
  if (event.httpMethod === "GET" || query.echostr) {
    if (!signature || sha1([token, timestamp, nonce]) !== signature) return { statusCode: 403, body: "invalid signature" };
    return { statusCode: 200, headers: { "content-type": "text/plain; charset=utf-8" }, body: query.echostr || "" };
  }
  if (signature && sha1([token, timestamp, nonce]) !== signature) return { statusCode: 403, body: "invalid signature" };
  const payload = parseBody(event.body);
  if (!payload || Object.keys(payload).length === 0) return { statusCode: 400, body: "invalid json body" };
  const result = await cloud.callFunction({ name: "payCallback", data: payload });
  const callbackResult = result && result.result ? result.result : result;
  return { statusCode: 200, headers: { "content-type": "application/json" }, body: JSON.stringify(callbackResult || { errcode: 0, errmsg: "ok" }) };
};
