# 中职数字媒体刷题小程序

这是一个微信原生小程序项目，已加入微信云开发能力。当前云函数覆盖登录、会员校验、微信支付开通会员、随机练习、模拟练习、提交练习、错题记录和答题记录。

## 云开发目录

云函数位于 `cloudfunctions` 目录：

- `login`：获取用户 openid，并在 `users` 集合中创建或更新用户。
- `checkMember`：读取 `users` 集合中的会员状态。
- `getMemberPlans`：读取启用中的会员套餐，按排序返回；开发环境无套餐时返回默认套餐。
- `createMemberOrder`：创建会员支付订单，并调用云开发微信支付统一下单。
- `payCallback`：接收微信支付回调，确认支付成功后自动开通或续期会员。
- `getPaymentOrders`：读取当前用户自己的会员支付记录。
- `getRandomQuestions`：从 `questions` 集合随机获取练习题。
- `getMockQuestions`：会员校验通过后获取模拟练习题。
- `submitPractice`：提交答案，写入 `answer_records`，错题写入或更新 `wrong_records`。
- `getWrongRecords`：获取当前用户错题本。
- `getAnswerRecords`：获取当前用户答题记录。

所有云函数均使用 `wx-server-sdk`。

## 数据库集合

请在微信开发者工具或云开发控制台中手动创建以下集合：

- `users`
- `questions`
- `wrong_records`
- `answer_records`
- `member_plans`
- `payment_orders`
- `member_logs`

建议字段设计：

### users

```json
{
  "_openid": "用户 openid",
  "nickName": "用户昵称",
  "avatarUrl": "头像地址",
  "isMember": false,
  "memberStatus": "normal",
  "memberExpireAt": null,
  "createdAt": "数据库服务时间",
  "updatedAt": "数据库服务时间"
}
```

会员支持微信支付自动开通，也保留管理员手动开通作为测试、线下收款、补偿用户和客服处理异常订单的备用功能。`memberExpireAt` 为空时，只要 `isMember` 为 `true` 就视为会员。

### member_plans

```json
{
  "name": "月度会员",
  "days": 30,
  "price": 990,
  "priceText": "9.90元",
  "enabled": true,
  "sort": 1,
  "createdAt": "数据库服务时间",
  "updatedAt": "数据库服务时间"
}
```

### payment_orders

```json
{
  "_openid": "用户 openid",
  "outTradeNo": "member_时间戳_随机数",
  "planId": "套餐 _id",
  "planName": "月度会员",
  "days": 30,
  "totalFee": 990,
  "status": "pending",
  "transactionId": "微信支付订单号",
  "memberExpireAtBefore": "支付前会员到期时间",
  "memberExpireAtAfter": "支付后会员到期时间",
  "createdAt": "数据库服务时间",
  "paidAt": "数据库服务时间",
  "updatedAt": "数据库服务时间"
}
```

`status` 取值：`pending`、`paid`、`closed`、`failed`。

### questions

```json
{
  "title": "题干",
  "type": "single",
  "options": [
    { "key": "A", "text": "选项 A" }
  ],
  "answer": "A",
  "analysis": "答案解析",
  "category": "数字媒体",
  "difficulty": "easy",
  "isMock": true,
  "mockGroup": "mock-001",
  "status": "active"
}
```

### wrong_records

```json
{
  "_openid": "用户 openid",
  "questionId": "题目 _id",
  "questionSnapshot": {},
  "selectedAnswer": "A",
  "correctAnswer": "B",
  "analysis": "答案解析",
  "wrongCount": 1,
  "lastWrongAt": "数据库服务时间",
  "createdAt": "数据库服务时间",
  "updatedAt": "数据库服务时间"
}
```

### answer_records

```json
{
  "_openid": "用户 openid",
  "questionId": "题目 _id",
  "questionSnapshot": {},
  "selectedAnswer": "A",
  "correctAnswer": "B",
  "analysis": "答案解析",
  "isCorrect": false,
  "practiceType": "random",
  "createdAt": "数据库服务时间"
}
```

## 初始化步骤

1. 在微信开发者工具中开通云开发，并确认 `miniprogram/app.js` 中的 `env` 为当前云环境 ID。
2. 在云开发控制台手动创建 `users`、`questions`、`wrong_records`、`answer_records`、`member_plans`、`payment_orders`、`member_logs` 集合。
3. 将 `database-samples/questions.sample.json` 中的题目导入 `questions` 集合，将 `database-samples/member_plans.sample.json` 导入 `member_plans` 集合。
4. 右键 `cloudfunctions` 下每个云函数目录，选择上传并部署。首次部署需要安装依赖。
5. 管理员如需手动开通会员，可在管理员中心继续使用手动开通功能。

## 示例数据

题库示例文件：`database-samples/questions.sample.json`。

会员套餐示例文件：`database-samples/member_plans.sample.json`。

## 微信支付开通会员

本项目的会员购买使用微信原生小程序 + 微信云开发支付能力完成，不需要 Spring Boot、MySQL 或第三方框架。

上线前需要完成以下配置：

1. 申请并开通微信支付商户号。
2. 在微信公众平台将小程序 AppID 关联到微信支付商户号。
3. 在云开发控制台开通并配置云开发支付能力。
4. 创建 `member_plans` 和 `payment_orders` 集合，并导入 `database-samples/member_plans.sample.json`。
5. 上传部署 `getMemberPlans`、`createMemberOrder`、`payCallback`、`getPaymentOrders` 云函数。
6. 在 `cloudfunctions/createMemberOrder/index.js` 中确认并替换 `subMchId`，确认 `envId` 和 `functionName: "payCallback"` 与当前云环境及回调云函数名称一致。
7. 支付成功后必须由 `payCallback` 确认微信支付回调，再更新 `users`、`payment_orders` 和 `member_logs`。不要只依赖前端 `wx.requestPayment` 的 `success` 回调开通会员。
8. 管理员手动开通会员功能仍然保留，用于测试、线下收款、补偿用户和客服处理异常订单。

支付流程：

1. 会员页调用 `getMemberPlans` 展示启用中的会员套餐。
2. 用户点击“立即开通”或“立即续费”后调用 `createMemberOrder`。
3. `createMemberOrder` 写入 `payment_orders` 的 `pending` 订单，并调用 `cloud.cloudPay.unifiedOrder` 创建微信支付订单。
4. 前端调用 `wx.requestPayment` 拉起微信支付。
5. 微信支付成功后触发 `payCallback`。
6. `payCallback` 校验订单、金额和幂等状态，自动开通或续期会员，并写入 `member_logs`。

## 题库批量导入

管理员可在小程序内进入“个人中心” -> “管理员中心” -> “题库批量导入”，将题库导入到 `questions` 集合。当前支持三种导入方式：粘贴 JSON、上传 JSON 文件、上传 CSV 文件。

导入格式示例：

```json
[
  {
    "title": "下列哪一项属于位图图像格式？",
    "type": "single",
    "imageUrl": "",
    "options": [
      { "label": "A", "text": "JPG" },
      { "label": "B", "text": "MP3" },
      { "label": "C", "text": "DOCX" },
      { "label": "D", "text": "XLSX" }
    ],
    "answer": ["A"],
    "analysis": "JPG属于常见的位图图像格式。",
    "category": "数字媒体基础",
    "difficulty": "easy",
    "isMock": true
  }
]
```

JSON 顶层必须是数组。粘贴 JSON、上传 JSON 文件和上传 CSV 文件最终都会转换为同一份 questions 数组，并走同一套校验逻辑。

每道题校验规则：

- `title` 不能为空。
- `type` 必须是 `single`、`multiple`、`judge`。
- `answer` 必须是数组。
- `analysis` 不能为空。
- `category` 不能为空。
- `options` 必须是数组。
- 单选题 `answer` 只能有一个。
- 多选题 `answer` 至少有一个。
- 单选题和多选题的答案必须存在于 `options.label` 中。
- 判断题答案必须能识别为 `true`、`false`、`正确`、`错误`、`A`、`B`。
- `difficulty` 为空时默认 `easy`。
- `imageUrl` 为空时默认空字符串。
- `isMock` 为空时默认 `true`。

CSV 表头固定为：

```csv
title,type,A,B,C,D,answer,analysis,category,difficulty,isMock,imageUrl
```

CSV 字段说明：

- `title`：题干，必填。
- `type`：题型，`single` / `multiple` / `judge`，必填。
- `A`、`B`、`C`、`D`：选项。判断题可只填 A=正确、B=错误，也可留空使用默认判断选项。
- `answer`：正确答案，必填。单选填 `A`，多选填 `A,B`，判断填 `true` / `false`，也兼容 `正确` / `错误`。
- `analysis`：解析，必填。
- `category`：分类，必填。
- `difficulty`：`easy` / `medium` / `hard`，为空时默认 `easy`。
- `isMock`：`true` / `false`，为空时默认 `true`。
- `imageUrl`：图片地址，可为空。

可用 Excel/WPS 按上述表头制作表格，另存为 CSV 文件后在小程序中选择上传。包含英文逗号的字段请用双引号包裹，例如 `"这是一道包含,逗号的题干"`。

导入步骤：

1. 确认当前 openid 已配置到 `admin_config.adminOpenids`。
2. 上传部署 `checkAdmin` 和 `adminImportQuestions` 云函数。
3. 进入“题库批量导入”页面。
4. 选择“粘贴 JSON”、“上传 JSON 文件”或“上传 CSV 文件”。
5. 粘贴内容或选择文件后，点击“校验格式”。
6. 校验通过后点击“开始导入”。

重复题处理：导入时按 `title + category` 判断是否重复。已存在的题目会跳过，不覆盖原题，导入结果会显示跳过数量和题干。

导入结果说明：

- `total`：本次提交的总题数。
- `successCount`：成功写入 `questions` 集合的题数。
- `skippedCount`：按 `title + category` 判断为重复并跳过的题数。
- `failCount`：格式校验失败或单题写入失败的数量。
- `errors`：失败原因列表，会标明第几题或第几行。
- `skippedItems`：重复跳过的题目列表。

示例文件位置：

- JSON 示例：`database-samples/questions.import.sample.json`
- CSV 示例：`database-samples/questions.import.sample.csv`

图片题的 `imageUrl` 可以先使用空字符串，后期再替换为云存储文件地址。

## 题目图片上传

管理员进入“管理员中心” -> “题库管理” -> “新增题目”或“编辑题目”后，可以在“图片地址”附近点击“选择图片”上传题目图片。

上传规则：

- 图片从本地相册选择。
- 图片会上传到微信云存储的 `question-images/` 目录。
- 上传成功后，云存储 `fileID` 会自动写入题目的 `imageUrl` 字段。
- 保存题目时，`imageUrl` 会随题目一起保存到 `questions` 集合。
- 支持 `jpg`、`jpeg`、`png`、`webp`，建议单张图片控制在 2MB 以内。
- 发布前请在云开发控制台检查云存储权限，确保小程序端可以读取题目图片。

编辑已有题目时，如果题目已有 `imageUrl`，页面会自动显示预览图。删除图片只会清空当前题目的 `imageUrl`，不会删除云存储中的原文件。

如果保存题目时报 `FUNCTION_NOT_FOUND` 或 “FunctionName parameter could not be found”，请确认：

- 已在当前云环境上传部署 `adminAddQuestion` 和 `adminUpdateQuestion`。
- 编辑题目前需要上传部署 `adminGetQuestions`。
- `miniprogram/app.js` 初始化的云环境是你部署这些云函数的同一个环境；如果 `envList.js` 为空，请在微信开发者工具中手动选择正确云环境，或补充当前环境 ID。

常见错误：

- 表头缺失：CSV 必须包含 `title,type,A,B,C,D,answer,analysis,category,difficulty,isMock,imageUrl`。
- 字段中包含英文逗号：请用双引号包裹，例如 `"图像格式 JPG, PNG, GIF 的区别是什么？"`。
- JSON 格式错误：检查是否为合法 JSON 数组，字符串是否使用英文双引号。
- 必填字段为空：检查 `title`、`type`、`answer`、`analysis`、`category`。
- 答案不在选项中：单选题和多选题的 `answer` 必须匹配 `options.label`，CSV 中通常是 `A`、`B`、`C`、`D`。
- 判断题答案无法识别：判断题答案请填写 `true`、`false`、`正确`、`错误`、`A` 或 `B`。
- 重复题被跳过：相同 `title + category` 已存在，不会覆盖原题。
- 文件过大：单个文件超过 2MB 时请拆分后导入。
## PC Web 管理后台基础框架

本项目已新增独立 PC Web 管理后台，目录为 `admin-web`。小程序端管理员功能仍然保留，继续使用小程序 `openid` 和 `admin_config.adminOpenids` 判断管理员；现有小程序管理员页面、学生端刷题功能和原有 `admin*` 云函数不需要删除或重命名。

PC 后台技术栈为 Vue 3、Vite、Element Plus、JavaScript 和 CloudBase Web SDK，不使用 Spring Boot、MySQL 或 Java 后端。

### 启动方式

```bash
cd admin-web
npm install
npm run dev
```

启动前请在 `admin-web/src/cloudbase/index.js` 中将 `env: "请填写你的云开发环境ID"` 替换为当前微信云开发环境 ID。

### 数据库集合

请在同一个微信云开发环境中创建以下集合：

- `admin_accounts`
- `admin_sessions`

默认管理员示例数据位于 `database-samples/admin_accounts.sample.json`，可导入 `admin_accounts` 集合。

演示阶段使用明文密码，正式上线前应改为密码哈希。

### 需要上传部署的云函数

PC 后台登录体系新增以下云函数，需要上传并部署到同一个微信云开发环境：

- `adminWebLogin`
- `adminWebLogout`
- `adminWebCheckSession`

### 小程序上传忽略

`project.config.json` 已在 `packOptions.ignore` 中加入 `admin-web`，小程序上传时不会把 PC 后台代码打包进去。

## PC Web 管理后台第二阶段

本阶段实现 PC 后台的数据概览仪表盘和题库列表管理，不影响小程序端管理员功能。

### 新增云函数

以下云函数需要上传并部署到同一个微信云开发环境：

- `webAdminGetStats`：用于 PC 后台数据概览，统计用户、会员、题目、练习记录、错题记录和今日练习次数。
- `webAdminGetQuestions`：用于 PC 后台题库列表，支持题干关键词、分类、题型、难度、是否模拟题筛选和分页。
- `webAdminDeleteQuestion`：用于 PC 后台删除题目，只删除 `questions` 集合中的题目，不联动删除错题记录或答题记录快照。

所有 `webAdmin*` 云函数都会校验 `admin_sessions` 中的 `token`。如果 token 不存在、失效或过期，会返回：

```json
{
  "success": false,
  "message": "登录已失效，请重新登录"
}
```

### 页面功能

- `admin-web/src/views/Dashboard.vue`：数据概览页面，调用 `webAdminGetStats`，展示总用户数、会员用户数、总题目数、总练习次数、总错题数和今日练习次数。
- `admin-web/src/views/QuestionList.vue`：题库管理页面，调用 `webAdminGetQuestions` 和 `webAdminDeleteQuestion`，支持筛选、分页、删除确认和删除后刷新。
- `/dashboard`：数据概览。
- `/questions`：题库管理。

### 启动后台

```bash
cd admin-web
npm install
npm run dev
```

### 测试数据概览

1. 确认已部署 `webAdminGetStats`。
2. 登录 PC 后台。
3. 进入 `/dashboard`。
4. 检查 6 个统计卡片是否正常显示。
5. 点击“刷新数据”，确认 loading 和刷新结果正常。

### 测试题库列表

1. 确认已部署 `webAdminGetQuestions`。
2. 登录 PC 后台。
3. 进入 `/questions`。
4. 使用题干关键词、分类、题型、难度、是否模拟题筛选。
5. 切换页码和每页数量，确认分页正常。
6. 无数据时页面应显示空状态，请求失败时应显示错误提示。

### 测试删除题目

1. 确认已部署 `webAdminDeleteQuestion`。
2. 在 `/questions` 点击某条题目的“删除”按钮。
3. 取消确认框时不应删除题目。
4. 确认删除后应提示删除成功，并刷新列表。
5. 删除只影响 `questions` 集合，不会删除 `wrong_records` 或 `answer_records` 中的历史快照。

## PC Web 管理后台第三阶段

本阶段实现 PC 后台新增题目、编辑题目、题目图片上传，以及 JSON / CSV 题库导入。小程序端管理员功能和学生端刷题逻辑保持不变。

### 新增云函数

以下云函数需要上传并部署到同一个微信云开发环境：

- `webAdminAddQuestion`：PC 后台新增题目。
- `webAdminUpdateQuestion`：PC 后台编辑题目。
- `webAdminGetQuestionDetail`：PC 后台编辑时读取题目详情。
- `webAdminImportQuestions`：PC 后台批量导入题库。

这些云函数都会校验 `admin_sessions` 中的 `token`，登录失效时返回“登录已失效，请重新登录”。

### 页面入口

- `/questions/create`：新增题目。
- `/questions/edit/:id`：编辑题目。
- `/questions/import`：题库导入。

题库列表页 `/questions` 中的“新增题目”“编辑”“批量导入”按钮已经连接到以上页面。

### 新增题目

1. 登录 PC 后台。
2. 进入 `/questions`。
3. 点击“新增题目”。
4. 填写题干、题型、选项、答案、解析、分类、难度和是否模拟题。
5. 点击“保存”，保存成功后返回题库列表。

### 编辑题目

1. 登录 PC 后台。
2. 进入 `/questions`。
3. 点击某道题的“编辑”。
4. 页面会调用 `webAdminGetQuestionDetail` 加载题目详情。
5. 修改后保存，保存成功后返回题库列表。

### 上传题目图片

1. 在新增或编辑题目页面点击“上传题目图片”。
2. 选择 jpg、jpeg、png 或 webp 图片。
3. 建议单张图片不超过 5MB。
4. 图片会上传到云存储 `question-images/` 目录。
5. 上传成功后 `fileID` 会自动写入 `imageUrl`，并显示预览。

如果上传失败，请检查 CloudBase Web 端云存储权限、安全域名和当前环境 ID。

### CSV 导入

CSV 模板位于 `database-samples/questions.import.sample.csv`。表头固定为：

```csv
title,type,A,B,C,D,answer,analysis,category,difficulty,isMock,imageUrl
```

字段说明：

- `title`：题干，必填。
- `type`：`single` / `multiple` / `judge`，必填。
- `A`、`B`、`C`、`D`：选项。
- `answer`：正确答案，单选填 `A`，多选填 `A,B`，判断题填 `true` / `false`，也兼容“正确” / “错误”。
- `analysis`：解析，必填。
- `category`：分类，必填。
- `difficulty`：`easy` / `medium` / `hard`，为空默认 `easy`。
- `isMock`：`true` / `false`，为空默认 `true`。
- `imageUrl`：图片地址或云存储 `fileID`，可为空。

CSV 支持双引号字段和字段中的英文逗号。

### JSON 导入

JSON 模板位于 `database-samples/questions.import.sample.json`。顶层必须是题目数组，每道题包含：

- `title`
- `type`
- `imageUrl`
- `options`
- `answer`
- `analysis`
- `category`
- `difficulty`
- `isMock`

导入页会先做前端校验和预览，开始导入后 `webAdminImportQuestions` 会在服务端再次校验。

### 查看导入结果

导入完成后页面会展示：

- 总题数 `total`
- 成功导入 `successCount`
- 重复跳过 `skippedCount`
- 失败数量 `failCount`
- 重复题列表 `skippedItems`
- 失败原因列表 `errors`

重复判断规则为 `title + category`，重复题会跳过，不覆盖原题。

## PC Web 管理后台第四阶段

本阶段实现 PC 后台用户会员管理和学习记录管理。小程序端管理员功能、题库管理、题库导入和学生端刷题逻辑保持不变。

### 新增云函数

以下云函数需要上传并部署到同一个微信云开发环境：

- `webAdminGetUsers`：用于 PC 后台用户列表，支持昵称 / openid 搜索、会员状态筛选和分页。
- `webAdminUpdateMember`：用于 PC 后台开通、续期、取消会员，并写入 `member_logs`。
- `webAdminGetRecords`：用于 PC 后台学习记录列表，支持用户关键词、练习类型和日期范围筛选。
- `webAdminGetRecordDetail`：用于 PC 后台查看某次学习记录详情。

这些云函数都会校验 `admin_sessions` 中的 `token`，登录失效时返回“登录已失效，请重新登录”。

### 用户会员管理

入口：`/users`，左侧菜单“用户会员”。

功能：

- 按昵称或 openid 搜索用户。
- 按普通用户、有效会员、已过期会员筛选。
- 查看头像、昵称、脱敏 openid、会员状态、会员到期时间和注册时间。
- 开通会员、续期会员、取消会员。
- 开通和续期支持 30 天、90 天、180 天、365 天，也支持指定到期时间。
- 会员操作会写入 `member_logs`，包含目标 openid、操作类型、会员状态、到期时间、操作管理员和操作时间。

### 学习记录管理

入口：`/records`，左侧菜单“学习记录”。

功能：

- 按 openid 或昵称搜索学习记录。
- 按随机一练、分类练习、模拟考试、错题练习筛选。
- 按完成日期范围筛选。
- 查看用户、练习类型、分类、分数、正确数、错误数、用时和完成时间。
- 点击“查看详情”可查看本次题目详情。
- 历史记录缺少题目快照时，会显示“该历史记录缺少详细题目快照，仅能查看基础成绩信息。”

### 测试会员开通、续期、取消

1. 确认已部署 `webAdminGetUsers` 和 `webAdminUpdateMember`。
2. 登录 PC 后台并进入 `/users`。
3. 使用关键词和会员状态筛选用户。
4. 点击“开通”，选择天数或指定到期时间，确认后检查会员状态变为有效会员。
5. 点击“续期”，确认后检查到期时间延长。
6. 点击“取消”，确认后检查会员状态变为普通用户。
7. 在 `member_logs` 集合中确认操作日志已写入。

### 测试学习记录筛选和详情

1. 确认已部署 `webAdminGetRecords` 和 `webAdminGetRecordDetail`。
2. 登录 PC 后台并进入 `/records`。
3. 使用用户关键词、练习类型和日期范围筛选。
4. 切换页码和每页数量，确认分页正常。
5. 点击“查看详情”，确认基础成绩信息正常展示。
6. 如果记录包含题目快照，应能看到题干、用户答案、正确答案、是否正确和解析。
7. 如果记录缺少题目快照，应显示友好提示，不应报错。
