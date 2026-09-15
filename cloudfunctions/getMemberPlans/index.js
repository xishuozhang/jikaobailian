const cloud = require("wx-server-sdk");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

const DEFAULT_PLANS = [
  {
    _id: "monthly",
    name: "月度会员",
    days: 30,
    price: 990,
    productId: "member_monthly",
    priceText: "9.90元",
    enabled: true,
    sort: 1
  },
  {
    _id: "quarterly",
    name: "季度会员",
    days: 90,
    price: 1990,
    productId: "member_quarterly",
    priceText: "19.90元",
    enabled: true,
    sort: 2
  },
  {
    _id: "yearly",
    name: "年度会员",
    days: 365,
    price: 5990,
    productId: "member_yearly",
    priceText: "59.90元",
    enabled: true,
    sort: 3
  }
];

const isCollectionMissing = (error) => {
  const message = `${error.errMsg || error.message || ""}`;
  return message.includes("collection not exists")
    || message.includes("collection doesn't exists")
    || message.includes("collection not exist")
    || message.includes("集合不存在");
};

exports.main = async () => {
  try {
    const result = await db.collection("member_plans")
      .where({ enabled: true })
      .orderBy("sort", "asc")
      .get();

    return {
      plans: result.data.length ? result.data : DEFAULT_PLANS
    };
  } catch (error) {
    if (isCollectionMissing(error)) {
      return { plans: DEFAULT_PLANS };
    }

    throw error;
  }
};
