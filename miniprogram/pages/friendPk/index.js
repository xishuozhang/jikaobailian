const TYPE_TEXT = { single: "单选题", multiple: "多选题", judge: "判断题" };
const RESULT = { win: ["胜利", "这一局，你更胜一筹"], lose: ["惜败", "复盘这一局，下次再超越"], draw: ["平局", "旗鼓相当，再来一场"] };
const clockText = (seconds) => `${Math.floor(seconds / 60)}`.padStart(2, "0") + ":" + `${seconds % 60}`.padStart(2, "0");

Page({
  data: {
    room: null, duration: 180, durations: [{ value: 60, text: "1 分钟" }, { value: 180, text: "3 分钟" }, { value: 300, text: "5 分钟" }],
    busy: false, errorText: "", resumeId: "", me: {}, opponent: null, currentQuestion: null,
    selected: [], canConfirm: false, currentIndex: 0, remaining: 0, timerText: "03:00", countdown: 0,
    resultKind: "", resultTitle: "", resultSubtitle: "", review: [], showReview: false,
    sparks: Array.from({ length: 16 }, (_, index) => ({ id: index, style: `left:${index * 6 + 2}%;animation-delay:${(index % 5) * 0.16}s;background:${["#3599ed", "#f3b94d", "#50bc9a", "#f38e7a"][index % 4]};` }))
  },

  onLoad(options = {}) {
    this._roomId = options.roomId || "";
    this._offset = 0;
    this.setData({ resumeId: wx.getStorageSync("friend_pk_room") || "" });
    if (this._roomId) this.act("join");
  },

  onShow() {
    this._visible = true;
    this.stopTimers();
    this._pollTimer = setInterval(() => this.poll(), 1800);
    this._clockTimer = setInterval(() => this.updateClock(), 200);
    if (this.data.room) this.poll();
  },

  onHide() { this._visible = false; this.stopTimers(); },
  onUnload() { this._destroyed = true; this.stopTimers(); },
  stopTimers() { clearInterval(this._pollTimer); clearInterval(this._clockTimer); },

  async request(action, extra = {}) {
    if (this._inflight) await this._inflight.catch(() => {});
    if (this._destroyed) return;
    const pending = wx.cloud.callFunction({ name: "friendPk", data: { action, roomId: this._roomId, ...extra } });
    this._inflight = pending;
    try {
      const { result } = await pending;
      if (result && result.left) return { left: true };
      if (!result || result.errCode || !result.room) throw new Error(result && result.errMsg || "房间同步失败");
      if (!this._destroyed) this.applyRoom(result.room);
      return result.room;
    } finally {
      if (this._inflight === pending) this._inflight = null;
    }
  },

  async act(action, extra = {}) {
    if (this._acting) return;
    this._acting = true;
    this.setData({ busy: true, errorText: "" });
    try { return await this.request(action, extra); }
    catch (error) { if (!this._destroyed) this.setData({ errorText: error.message || "连接失败，请重试" }); }
    finally { this._acting = false; if (!this._destroyed) this.setData({ busy: false }); }
  },

  async poll() {
    if (!this._visible || this._inflight || this._acting || !this.data.room
      || !["waiting", "playing"].includes(this.data.room.status)) return;
    if (this._lastPollAt && Date.now() - this._lastPollAt < 1200) return;
    this._lastPollAt = Date.now();
    try { await this.request("status"); }
    catch (error) { if (!this._destroyed) this.setData({ errorText: "连接中断，正在重连；计时仍在继续" }); }
  },

  applyRoom(room) {
    if (this.data.room && room.id === this.data.room.id && room.version < this.data.room.version) return;
    this._roomId = room.id;
    this._offset = room.serverNow - Date.now();
    const me = room.players[room.me];
    const opponent = room.players.find((item) => !item.isMe) || null;
    const changedQuestion = !this.data.room || room.id !== this.data.room.id || me.answered !== this.data.currentIndex;
    const selected = changedQuestion ? [] : this.data.selected;
    const raw = room.questions[me.answered];
    const currentQuestion = raw ? { ...raw, typeText: TYPE_TEXT[raw.type], options: raw.options.map((option) => ({ ...option, selected: selected.includes(option.key) })) } : null;
    let resultKind = "";
    if (room.status === "finished") resultKind = room.winner === -1 ? "draw" : room.winner === room.me ? "win" : "lose";
    const labels = RESULT[resultKind] || ["", ""];
    const review = room.status === "finished" ? room.questions.map((question, index) => ({
      ...question, number: index + 1, typeText: TYPE_TEXT[question.type],
      mineText: question.mine.join("、") || "未作答", answerText: question.answer.join("、"),
      correct: JSON.stringify(question.mine) === JSON.stringify(question.answer)
    })) : [];
    this.setData({ room, me, opponent, currentQuestion, currentIndex: me.answered, selected,
      canConfirm: selected.length > 0, errorText: "", resultKind, resultTitle: labels[0],
      resultSubtitle: room.reason === "forfeit" ? (me.forfeited ? "你已退出本场对战" : "对手已退出本场对战") : labels[1], review });
    if (["waiting", "playing"].includes(room.status)) wx.setStorageSync("friend_pk_room", room.id);
    else { wx.removeStorageSync("friend_pk_room"); this.setData({ resumeId: "" }); }
    this.updateClock();
    if (resultKind && this._celebrated !== room.id) {
      this._celebrated = room.id;
      if (typeof wx.vibrateShort === "function") wx.vibrateShort({ type: "light" });
    }
  },

  updateClock() {
    const room = this.data.room;
    if (!room || this._destroyed) return;
    const now = Date.now() + this._offset;
    const countdown = room.status === "playing" ? Math.max(0, Math.ceil((room.startAt - now) / 1000)) : 0;
    const remaining = room.status === "playing" ? Math.max(0, Math.ceil((room.deadline - Math.max(now, room.startAt)) / 1000)) : room.duration;
    const values = { countdown, remaining, timerText: clockText(remaining) };
    if (countdown !== this.data.countdown || remaining !== this.data.remaining) this.setData(values);
    if (room.status === "playing" && ((!countdown && !this.data.currentQuestion && !this.data.me.done) || remaining === 0)) this.poll();
  },

  chooseDuration(e) { if (!this.data.busy) this.setData({ duration: Number(e.currentTarget.dataset.value) }); },
  async createRoom() {
    if (!this._requestId) this._requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    await this.act("create", { requestId: this._requestId, duration: this.data.duration });
  },
  resumeRoom() { this._roomId = this.data.resumeId; this.act("join"); },
  retry() { if (this._roomId) this.act(this.data.room ? "status" : "join"); else this.createRoom(); },
  toggleReady() { this.act("ready", { ready: !this.data.me.ready }); },
  selectOption(e) {
    if (this.data.busy || !this.data.remaining || this.data.countdown || !this.data.currentQuestion) return;
    const key = e.currentTarget.dataset.key;
    const question = this.data.currentQuestion;
    const selected = question.type === "multiple"
      ? this.data.selected.includes(key) ? this.data.selected.filter((value) => value !== key) : [...this.data.selected, key]
      : [key];
    this.setData({ selected, canConfirm: selected.length > 0,
      currentQuestion: { ...question, options: question.options.map((option) => ({ ...option, selected: selected.includes(option.key) })) } });
  },
  confirmAnswer() {
    if (this.data.canConfirm && this.data.remaining && !this.data.countdown) this.act("answer", { index: this.data.currentIndex, answer: this.data.selected });
  },
  toggleReview() { this.setData({ showReview: !this.data.showReview }); },
  newRound() {
    this._requestId = null;
    this._roomId = "";
    this.setData({ room: null, selected: [], showReview: false, errorText: "", resultKind: "", currentQuestion: null, resumeId: "" });
  },
  leaveRoom() {
    wx.showModal({ title: "离开 PK", content: this.data.room && this.data.room.status === "playing" ? "对战中主动退出将判负，确定离开吗？" : "确定离开当前房间吗？",
      success: async ({ confirm }) => {
        if (!confirm) return;
        const room = await this.act("leave");
        if (room) { wx.removeStorageSync("friend_pk_room"); wx.reLaunch({ url: "/pages/index/index" }); }
      } });
  },
  goHome() { wx.reLaunch({ url: "/pages/index/index" }); },
  onShareAppMessage() {
    if (this.data.room && this.data.room.status === "waiting") return {
      title: `来和我 PK！${this.data.room.total} 道同题，${this.data.room.duration / 60} 分钟见分晓`,
      path: `/pages/friendPk/index?roomId=${this.data.room.id}`
    };
    return { title: "好友 PK，一起挑战数字媒体题库", path: "/pages/friendPk/index" };
  }
});
