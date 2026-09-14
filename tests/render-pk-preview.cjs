const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const vm = require("node:vm");
const { pathToFileURL } = require("node:url");
const engine = require("../cloudfunctions/friendPk/engine");
const root = path.join(__dirname, "..");
const output = path.join(os.tmpdir(), "vchat-pk-preview");
fs.mkdirSync(output, { recursive: true });
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const width = Number(process.argv[2]) || 390;
let page;
let now = 1000;
vm.runInNewContext(read("miniprogram/pages/friendPk/index.js"), {
  Page: (value) => { page = value; }, Date: { now: () => now }, wx: { setStorageSync() {}, removeStorageSync() {}, vibrateShort() {} }
});
page.setData = (values) => Object.assign(page.data, values);
const states = { setup: structuredClone(page.data) };
const questions = Array.from({ length: 10 }, (_, i) => engine.prepareQuestion({
  _id: "q" + i, type: i === 0 ? "multiple" : "single",
  title: "以下哪些方式可以优化网页中的图片，让页面加载更快，同时保持良好的显示效果？",
  options: [{ key: "A", text: "根据显示尺寸选择合适的图片分辨率" }, { key: "B", text: "在所有页面直接使用未经压缩的原始图片" }, { key: "C", text: "为屏幕显示选择适当的图片格式" }],
  answer: i === 0 ? ["A", "C"] : "A"
}));
let room = engine.createRoom("a".repeat(64), "a", { nickName: "认真练习的同学" }, questions, 180, now);
room = engine.transition(room, "b", "join", {}, now, { nickName: "每天进步一点点" });
page.applyRoom(engine.publicRoom(room, "a", now)); states.waiting = structuredClone(page.data);
room = engine.transition(room, "a", "ready", { ready: true }, now);
room = engine.transition(room, "b", "ready", { ready: true }, now);
page.applyRoom(engine.publicRoom(room, "a", now)); states.countdown = structuredClone(page.data);
now = room.startAt;
page.applyRoom(engine.publicRoom(room, "a", now)); states.playing = structuredClone(page.data);
for (let i = 0; i < questions.length; i++) {
  room = engine.transition(room, "a", "answer", { index: i, answer: questions[i].answer }, now);
  room = engine.transition(room, "b", "answer", { index: i, answer: "B" }, now);
}
page.applyRoom(engine.publicRoom(room, "a", now)); states.win = structuredClone(page.data);
page.applyRoom(engine.publicRoom(room, "b", now)); states.lose = structuredClone(page.data);
const template = read("miniprogram/pages/friendPk/index.wxml")
  .replace(/<image\b([^>]*?)\/>/g, "<img$1>")
  .replace(/<(\/?)(view|text|block)\b/g, (_, close, tag) => "<" + close + { view: "div", text: "span", block: "template" }[tag])
  .replace(/bindtap="([^"]+)"/g, 'data-action="$1"');
const css = (read("miniprogram/app.wxss") + read("miniprogram/pages/friendPk/index.wxss"))
  .replace(/([\d.]+)rpx/g, (_, value) => Number(value) * width / 750 + "px")
  .replace(/(^|\n)page\s*\{/g, "$1body {").replace(/(^|[ \n])image(?=\s*[{,])/g, "$1img");

function bootstrap(states, template, assets) {
  const holder = document.createElement("template");
  holder.innerHTML = template;
  const expression = (value) => value.replace(/^{{|}}$/g, "");
  function convert(parent) {
    for (const element of [...parent.children]) {
      if (element.hasAttribute("wx:for")) {
        const alias = element.getAttribute("wx:for-item") || "item";
        element.setAttribute("v-for", "(" + alias + ", index) in " + expression(element.getAttribute("wx:for")));
      }
      for (const attribute of [...element.attributes]) {
        const name = attribute.name, value = attribute.value;
        if (["wx:if", "wx:elif", "wx:else"].includes(name)) {
          element.setAttribute({ "wx:if": "v-if", "wx:elif": "v-else-if", "wx:else": "v-else" }[name], expression(value));
          element.removeAttribute(name);
        } else if (name.startsWith("wx:")) element.removeAttribute(name);
        else if (value.includes("{{")) {
          const parts = value.split(/({{.*?}})/g).filter(Boolean).map((part) => part.startsWith("{{") ? "(" + expression(part) + ")" : JSON.stringify(part));
          element.setAttribute(":" + name, parts.join("+"));
          element.removeAttribute(name);
        }
      }
      if (element.tagName === "IMG") {
        const value = element.getAttribute(":src");
        if (value) element.setAttribute(":src", "asset(" + value + ")");
      }
      convert(element.content || element);
    }
  }
  convert(holder.content);
  const state = location.hash.slice(1) || "setup";
  Vue.createApp({
    data: () => states[state] || states.setup,
    methods: { asset(value) { return value.startsWith("/") ? assets + value : value; } },
    template: holder.innerHTML
  }).mount("#app");
  document.title = "PK preview " + state;
  setTimeout(() => {
    const errors = [...document.querySelectorAll("img")].filter((img) => !img.complete || img.naturalWidth === 0).length;
    const overflow = document.documentElement.scrollWidth > innerWidth;
    document.body.setAttribute("data-qa", JSON.stringify({ errors, overflow, textLength: document.body.innerText.length }));
  }, 1000);
}
const vue = pathToFileURL(path.join(root, "admin-web/node_modules/vue/dist/vue.global.js")).href;
const assets = pathToFileURL(path.join(root, "miniprogram")).href;
const html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:0;width:' + width + 'px;max-width:' + width + 'px}*{box-sizing:border-box}button{border:0;display:block;cursor:pointer}img{object-fit:cover}' +
  css + '</style></head><body><div id="app"></div><script src="' + vue + '"></script><script>(' +
  bootstrap.toString() + ")(" + JSON.stringify(states) + "," + JSON.stringify(template) + "," + JSON.stringify(assets) + ");</script></body></html>";
const file = path.join(output, "pk-" + width + ".html");
fs.writeFileSync(file, html);
console.log(file);
