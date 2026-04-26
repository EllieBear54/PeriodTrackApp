import { useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "periodTrackerData";

function loadFromStorage() {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) {
      return JSON.parse(data);
    }
  } catch (e) {
    console.error("Failed to load from localStorage:", e);
  }
  return null;
}

function saveToStorage(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error("Failed to save to localStorage:", e);
  }
}

export default function App() {
  const today = new Date();
  const [visibleMonth, setVisibleMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(today);
  const [touchStartX, setTouchStartX] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [historyYearOpen, setHistoryYearOpen] = useState({});

  const [data, setData] = useState(() => {
    const stored = loadFromStorage();
    if (stored) {
      return {
        markedPeriodDates: stored.markedPeriodDates || {},
        dailyRecords: stored.dailyRecords || {},
        cycleLength: stored.cycleLength || 28,
        periodLength: stored.periodLength || 5,
        hasOnboarded: stored.hasOnboarded || false,
      };
    }
    return {
      markedPeriodDates: {},
      dailyRecords: {},
      cycleLength: 28,
      periodLength: 5,
      hasOnboarded: false,
    };
  });

  useEffect(() => {
    saveToStorage({
      markedPeriodDates: data.markedPeriodDates,
      dailyRecords: data.dailyRecords,
      cycleLength: data.cycleLength,
      periodLength: data.periodLength,
      hasOnboarded: data.hasOnboarded,
    });
  }, [data]);

  const selectedKey = toYmd(selectedDate);
  const isDateMarkedAsPeriod = !!data.markedPeriodDates[selectedKey];
  const selectedRecord = data.dailyRecords[selectedKey] || {
    isMenstruation: isDateMarkedAsPeriod ? "是" : "否",
    flowRecord: "",
    hasPain: "否",
    painDesc: "",
    moods: [],
    diary: "",
  };
  // 如果日期已标记但记录里不是"是"，更新记录
  if (isDateMarkedAsPeriod && selectedRecord.isMenstruation !== "是") {
    selectedRecord.isMenstruation = "是";
    updateDailyRecord({ isMenstruation: "是" });
  }

  const updateDailyRecord = (updates) => {
    setData((prev) => ({
      ...prev,
      dailyRecords: {
        ...prev.dailyRecords,
        [selectedKey]: { ...selectedRecord, ...updates },
      },
    }));
  };

  const updateCycleSetting = (cycleLength, periodLength) => {
    setData((prev) => ({
      ...prev,
      cycleLength,
      periodLength,
    }));
  };

  const setHasOnboarded = (value) => {
    setData((prev) => ({ ...prev, hasOnboarded: value }));
  };

  const visibleYear = visibleMonth.getFullYear();
  const visibleMonthIndex = visibleMonth.getMonth();
  const daysInMonth = new Date(visibleYear, visibleMonthIndex + 1, 0).getDate();
  const weekOffset = new Date(visibleYear, visibleMonthIndex, 1).getDay();

  const cycleLengthNum = data.cycleLength;
  const periodLengthNum = data.periodLength;
  const hasValidCycleSetting =
    cycleLengthNum >= 20 &&
    cycleLengthNum <= 45 &&
    periodLengthNum >= 2 &&
    periodLengthNum <= 10;

  const periodRanges = useMemo(() => buildPeriodRanges(data.markedPeriodDates), [data.markedPeriodDates]);
  const latestMarkedStart = useMemo(() => {
    if (!periodRanges.length) return null;
    return periodRanges[periodRanges.length - 1].startDate;
  }, [periodRanges]);

  const historyData = useMemo(() => buildHistoryFromRanges(periodRanges), [periodRanges]);

  const selectedPhase = useMemo(
    () =>
      getCalendarPhase({
        date: selectedDate,
        markedPeriodDates: data.markedPeriodDates,
        periodRanges,
        hasValidCycleSetting,
        latestMarkedStart,
        cycleLengthNum,
        periodLengthNum,
      }),
    [
      selectedDate,
      data.markedPeriodDates,
      periodRanges,
      hasValidCycleSetting,
      latestMarkedStart,
      cycleLengthNum,
      periodLengthNum,
    ]
  );
  const phaseContent = useMemo(() => getPhaseContent(selectedPhase), [selectedPhase]);
  const avgCycle = useMemo(
    () => average(historyData.map((item) => item.intervalDays).filter((num) => Number.isFinite(num))),
    [historyData]
  );
  const avgDuration = useMemo(() => average(historyData.map((item) => item.durationDays)), [historyData]);
  const historyByYear = useMemo(() => groupHistoryByYear(historyData), [historyData]);

  const cycleTip = useMemo(() => {
    if (historyData.length < 2) return "至少完成两个月经期标记后可分析周期变化。";
    const thisMonth = historyData[0].intervalDays;
    const previousMonth = historyData[1].intervalDays;
    if (!Number.isFinite(thisMonth) || !Number.isFinite(previousMonth)) return "数据不足，暂时无法分析周期变化。";
    const diff = thisMonth - previousMonth;
    if (diff === 0) return "本月周期与上月基本一致。";
    if (diff < 0) return `本月周期较上月提前${Math.abs(diff)}天。`;
    return `本月周期较上月延后${diff}天。`;
  }, [historyData]);

  const handleMonthChange = (offset) => {
    const nextMonth = new Date(visibleYear, visibleMonthIndex + offset, 1);
    setVisibleMonth(nextMonth);
  };

  const handleTouchStart = (event) => {
    setTouchStartX(event.changedTouches[0].clientX);
  };

  const handleTouchEnd = (event) => {
    if (touchStartX === null) return;
    const deltaX = event.changedTouches[0].clientX - touchStartX;
    if (deltaX > 50) handleMonthChange(-1);
    if (deltaX < -50) handleMonthChange(1);
    setTouchStartX(null);
  };

  const handleDayClick = (date) => setSelectedDate(date);

  const [lastMenstruationDate, setLastMenstruationDate] = useState(null);

  const handleMenstruationChoice = (value) => {
    const key = toYmd(selectedDate);

    if (value === "是") {
      updateDailyRecord({ isMenstruation: "是" });
      const updates = { ...data.markedPeriodDates, [key]: true };

      if (lastMenstruationDate) {
        const lastDate = parseYmd(lastMenstruationDate);
        const currentDate = parseYmd(key);
        const daysDiff = Math.abs(daysBetween(lastDate, currentDate));

        if (daysDiff > 0 && daysDiff <= 14) {
          const startDate = lastDate < currentDate ? lastDate : currentDate;
          const endDate = lastDate < currentDate ? currentDate : lastDate;

          for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
            updates[toYmd(new Date(d))] = true;
          }
        }
      }

      setData((prev) => ({ ...prev, markedPeriodDates: updates }));
      setLastMenstruationDate(key);
    } else {
      const currentDate = parseYmd(key);
      const periodRanges = buildPeriodRanges(data.markedPeriodDates);

      let rangeToRemove = null;
      for (const range of periodRanges) {
        if (currentDate >= range.startDate && currentDate <= range.endDate) {
          rangeToRemove = range;
          break;
        }
      }

      if (rangeToRemove) {
        setData((prev) => {
          const next = { ...prev, markedPeriodDates: { ...prev.markedPeriodDates } };
          for (let d = new Date(rangeToRemove.startDate); d <= rangeToRemove.endDate; d.setDate(d.getDate() + 1)) {
            const dateKey = toYmd(new Date(d));
            delete next.markedPeriodDates[dateKey];
          }
          return next;
        });
      } else {
        setData((prev) => {
          if (!prev.markedPeriodDates[key]) return prev;
          const next = { ...prev, markedPeriodDates: { ...prev.markedPeriodDates } };
          delete next.markedPeriodDates[key];
          return next;
        });
      }

      updateDailyRecord({ isMenstruation: "否" });
      setLastMenstruationDate(null);
    }
  };

  if (!data.hasOnboarded) {
    return (
      <main className="min-h-screen bg-rose-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl p-6 shadow-sm">
          <h1 className="text-xl font-semibold text-gray-900 mb-2">欢迎来到生理期记录</h1>
          <p className="text-sm text-gray-600 mb-6">
            这是一款帮助你理解身体变化规律的轻量应用。让我们先设置一些基本信息。
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-800 mb-2">上次月经开始日期</label>
              <input
                type="date"
                value={selectedKey}
                onChange={(e) => setSelectedDate(parseYmd(e.target.value) || today)}
                className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-rose-200"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-800 mb-2">月经周期（天）</label>
              <input
                type="number"
                min="20"
                max="45"
                value={data.cycleLength}
                onChange={(e) => updateCycleSetting(Number(e.target.value), data.periodLength)}
                className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-rose-200"
              />
              <p className="text-xs text-gray-500 mt-1">通常为 20-45 天，默认 28 天</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-800 mb-2">月经持续天数（天）</label>
              <input
                type="number"
                min="2"
                max="10"
                value={data.periodLength}
                onChange={(e) => updateCycleSetting(data.cycleLength, Number(e.target.value))}
                className="w-full h-10 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-rose-200"
              />
              <p className="text-xs text-gray-500 mt-1">通常为 2-10 天，默认 5 天</p>
            </div>

            <button
              type="button"
              onClick={() => {
                if (selectedKey) {
                  const startDate = parseYmd(selectedKey);
                  const markedDates = {};
                  for (let i = 0; i < data.periodLength; i++) {
                    const d = new Date(startDate);
                    d.setDate(d.getDate() + i);
                    markedDates[toYmd(d)] = true;
                  }
                  setData((prev) => ({ ...prev, markedPeriodDates: markedDates }));
                }
                setHasOnboarded(true);
              }}
              className="w-full min-h-10 bg-rose-400 hover:bg-rose-500 text-white font-medium rounded-xl transition"
            >
              开始使用
            </button>

            <button
              type="button"
              onClick={() => setHasOnboarded(true)}
              className="w-full min-h-10 border border-gray-200 text-gray-600 hover:bg-gray-50 font-medium rounded-xl transition"
            >
              跳过，稍后设置
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-rose-50 p-4 sm:p-6 max-[360px]:p-3 max-[153px]:p-1.5">
      {Object.keys(data.markedPeriodDates).length === 0 && (
        <div className="mx-auto max-w-4xl mb-6 rounded-2xl border border-rose-100 bg-rose-50 p-6 max-[360px]:p-4 max-[153px]:p-3">
          <p className="text-sm text-gray-700">
            <span className="font-medium">开始记录你的第一个经期吧！</span>
            <br />
            点击日历上的日期，选择"是"来标记月经期开始。
          </p>
        </div>
      )}

      <div className="mx-auto max-w-4xl space-y-6 max-[360px]:space-y-4 max-[153px]:space-y-2.5">
        <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm max-[360px]:rounded-xl max-[360px]:p-3.5 max-[153px]:rounded-lg max-[153px]:p-2">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => handleMonthChange(-1)}
              className="min-h-10 rounded-xl border border-gray-200 px-3 py-1 text-sm text-gray-600 hover:bg-gray-50 max-[360px]:min-h-9 max-[360px]:px-2.5 max-[360px]:text-xs max-[153px]:min-h-7 max-[153px]:rounded-md max-[153px]:px-1.5 max-[153px]:py-0.5 max-[153px]:text-[10px]"
            >
              ←
            </button>
            <p className="text-lg font-semibold text-gray-900 max-[360px]:text-base max-[153px]:text-xs">
              {visibleYear}/{visibleMonthIndex + 1}
            </p>
            <button
              type="button"
              onClick={() => handleMonthChange(1)}
              className="min-h-10 rounded-xl border border-gray-200 px-3 py-1 text-sm text-gray-600 hover:bg-gray-50 max-[360px]:min-h-9 max-[360px]:px-2.5 max-[360px]:text-xs max-[153px]:min-h-7 max-[153px]:rounded-md max-[153px]:px-1.5 max-[153px]:py-0.5 max-[153px]:text-[10px]"
            >
              →
            </button>
          </div>

          <div className="mt-3 grid grid-cols-7 gap-1.5 text-center text-[11px] text-gray-500 max-[360px]:gap-1 max-[360px]:text-[10px] max-[153px]:mt-1.5 max-[153px]:gap-0.5 max-[153px]:text-[8px]">
            {["日", "一", "二", "三", "四", "五", "六"].map((w) => (
              <div key={w} className="py-1">
                {w}
              </div>
            ))}
          </div>

          <div
            className="mt-1.5 grid grid-cols-7 gap-1.5 max-[360px]:gap-1 max-[153px]:gap-0.5"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            {Array.from({ length: weekOffset }).map((_, idx) => (
              <div key={`empty-${idx}`} className="h-10 max-[360px]:h-9 max-[153px]:h-6" />
            ))}
            {Array.from({ length: daysInMonth }, (_, idx) => {
              const day = idx + 1;
              const date = new Date(visibleYear, visibleMonthIndex, day);
              const phase = getCalendarPhase({
                date,
                markedPeriodDates: data.markedPeriodDates,
                periodRanges,
                hasValidCycleSetting,
                latestMarkedStart,
                cycleLengthNum,
                periodLengthNum,
              });
              const isSelected = isSameDate(date, selectedDate);
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => handleDayClick(date)}
                  className={[
                    "h-10 rounded-lg border text-xs transition max-[360px]:h-9 max-[153px]:h-6 max-[153px]:rounded-md max-[153px]:text-[9px]",
                    "hover:bg-gray-50",
                    getDayColorClass(phase),
                    isSelected ? "ring-2 ring-rose-300" : "",
                  ].join(" ")}
                >
                  {day}
                </button>
              );
            })}
          </div>

          <div className="mt-3 max-[153px]:mt-1.5">
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px] text-gray-600 max-[360px]:gap-x-2 max-[360px]:text-[10px] max-[153px]:gap-x-1 max-[153px]:gap-y-1 max-[153px]:text-[8px]">
              <LegendItem colorClass="bg-rose-200" text="红色：月经期" />
              <LegendItem colorClass="bg-emerald-100" text="绿色：卵泡期" />
              <LegendItem colorClass="bg-amber-100" text="黄色：黄体期" />
              <LegendItem colorClass="border border-dashed border-rose-300 bg-white" text="红色虚线：预测" />
            </div>
          </div>

          <div className="sticky bottom-2 z-10 mt-3 rounded-xl border border-gray-200 bg-white/95 p-3 shadow-sm backdrop-blur">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-600">已选日期：{toMd(selectedKey)}</span>
                <span className="text-xs text-rose-500">💡 先选开始日期，再选结束日期，中间自动填充</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-600">此日期是否为月经期？</span>
                <button
                  type="button"
                  onClick={() => handleMenstruationChoice(selectedRecord.isMenstruation === "是" ? "否" : "是")}
                  className={[
                    "relative min-h-9 w-20 rounded-full border transition-all duration-200",
                    selectedRecord.isMenstruation === "是"
                      ? "border-rose-400 bg-rose-100"
                      : "border-gray-300 bg-gray-100",
                  ].join(" ")}
                >
                  <span
                    className={[
                      "absolute top-1/2 -translate-y-1/2 h-7 w-7 rounded-full bg-white shadow transition-all duration-200",
                      selectedRecord.isMenstruation === "是" ? "left-[calc(100%-32px)]" : "left-1",
                    ].join(" ")}
                  />
                  <span
                    className={[
                      "absolute top-1/2 -translate-y-1/2 text-xs font-medium transition-all duration-200",
                      selectedRecord.isMenstruation === "是" ? "left-3 text-rose-600" : "right-3 text-gray-600",
                    ].join(" ")}
                  >
                    {selectedRecord.isMenstruation === "是" ? "是" : "否"}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm max-[360px]:rounded-xl max-[360px]:p-3.5 max-[153px]:rounded-lg max-[153px]:p-2">
          <div className="mt-4 space-y-5 max-[360px]:mt-2.5 max-[360px]:space-y-3.5 max-[153px]:mt-1.5 max-[153px]:space-y-2">
            {selectedRecord.isMenstruation === "是" && (
              <div className="space-y-4 rounded-xl border border-rose-100 bg-rose-50 p-4 max-[360px]:space-y-3 max-[360px]:p-3 max-[153px]:space-y-2 max-[153px]:rounded-md max-[153px]:p-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-800 max-[360px]:text-xs max-[153px]:mb-1 max-[153px]:text-[9px]">流量记录</label>
                  <input
                    value={selectedRecord.flowRecord}
                    onChange={(e) => updateDailyRecord({ flowRecord: e.target.value })}
                    placeholder="例如：每2个小时更换一次卫生巾"
                    className="w-full rounded-xl border border-gray-200 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-rose-200 max-[360px]:p-2.5 max-[360px]:text-xs max-[153px]:rounded-md max-[153px]:p-1.5 max-[153px]:text-[9px]"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-800 max-[360px]:text-xs max-[153px]:mb-1 max-[153px]:text-[9px]">痛经记录</label>
                  <div className="flex gap-2 max-[153px]:gap-1">
                    {["是", "否"].map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => updateDailyRecord({ hasPain: item })}
                        className={[
                          "min-h-10 rounded-xl border px-4 py-2 text-sm transition max-[360px]:min-h-9 max-[360px]:px-3 max-[360px]:py-1.5 max-[360px]:text-xs max-[153px]:min-h-7 max-[153px]:rounded-md max-[153px]:px-2 max-[153px]:py-1 max-[153px]:text-[9px]",
                          selectedRecord.hasPain === item
                            ? "border-rose-300 bg-rose-100 ring-1 ring-rose-300"
                            : "border-gray-200 bg-white hover:bg-gray-50",
                        ].join(" ")}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                  {selectedRecord.hasPain === "是" && (
                    <textarea
                      value={selectedRecord.painDesc}
                      onChange={(e) => updateDailyRecord({ painDesc: e.target.value })}
                      placeholder="描述一下不适位置、时长或缓解方式"
                      className="mt-3 w-full rounded-xl border border-gray-200 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-rose-200 max-[360px]:p-2.5 max-[360px]:text-xs max-[153px]:mt-1.5 max-[153px]:rounded-md max-[153px]:p-1.5 max-[153px]:text-[9px]"
                      rows={3}
                    />
                  )}
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-3 text-sm text-gray-700">
                  <p className="mb-1 font-medium text-gray-800 max-[360px]:text-xs max-[153px]:text-[9px]">周期变化提示</p>
                  <p>{cycleTip}</p>
                </div>
              </div>
            )}

            <div>
              <textarea
                value={selectedRecord.diary}
                onChange={(e) => updateDailyRecord({ diary: e.target.value })}
                placeholder="今日份碎碎念…"
                className="w-full rounded-xl border border-gray-200 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-rose-200 max-[360px]:p-2.5 max-[360px]:text-xs max-[153px]:rounded-md max-[153px]:p-1.5 max-[153px]:text-[9px]"
                rows={4}
              />
            </div>
          </div>
        </section>

        <section
          className={`rounded-2xl border border-gray-100 p-6 shadow-sm max-[360px]:rounded-xl max-[360px]:p-3.5 max-[153px]:rounded-lg max-[153px]:p-2 ${phaseContent.bgClass}`}
        >
          <p className="text-lg font-semibold text-gray-900 max-[360px]:text-base max-[153px]:text-xs">{phaseContent.title}</p>
          <div className="mt-4 space-y-3 text-sm leading-relaxed text-gray-700 max-[360px]:mt-3 max-[360px]:text-xs max-[153px]:mt-1.5 max-[153px]:space-y-1.5 max-[153px]:text-[9px]">
            <div>
              <p>{phaseContent.whatIs}</p>
            </div>
            <div>
              <p className="font-medium text-gray-900">激素变化：</p>
              <ul className="list-disc pl-5">
                {phaseContent.hormones.map((line, idx) => (
                  <li key={idx}>{line}</li>
                ))}
              </ul>
            </div>
            {phaseContent.bodyFeelings && phaseContent.bodyFeelings.length > 0 && (
              <div>
                <p className="font-medium text-gray-900">身体可能的感受：</p>
                <ul className="list-disc pl-5">
                  {phaseContent.bodyFeelings.map((line, idx) => (
                    <li key={idx}>{line}</li>
                  ))}
                </ul>
              </div>
            )}
            <div>
              <p className="font-medium text-gray-900">原理解释：</p>
              <p>{phaseContent.principle}</p>
            </div>
            <div>这些波动不是你的问题，而是你身体内部非常精密的生命律动。</div>
          </div>
          <div className="mt-3 rounded-xl border border-rose-100 bg-rose-50 p-3 text-xs leading-relaxed text-gray-700 max-[360px]:text-[11px] max-[153px]:mt-1.5 max-[153px]:rounded-md max-[153px]:p-1.5 max-[153px]:text-[8px]">
            <p className="font-medium text-rose-700 max-[153px]:text-[8px]">提示：</p>
            <p>无论是否处于排卵期，都存在怀孕的可能。</p>
            <p>如无备孕计划，请采取可靠避孕措施。</p>
          </div>
        </section>

        <section className="space-y-3 max-[360px]:space-y-2 max-[153px]:space-y-1.5">
          <button
            type="button"
            onClick={() => setShowHistory((prev) => !prev)}
            className="min-h-10 rounded-xl border bg-white px-4 py-2 shadow-sm transition hover:bg-gray-50 max-[360px]:min-h-9 max-[360px]:px-3 max-[360px]:py-1.5 max-[360px]:text-xs max-[153px]:min-h-7 max-[153px]:rounded-md max-[153px]:px-2 max-[153px]:py-1 max-[153px]:text-[9px]"
          >
            查看历史记录
          </button>
          {showHistory && (
            <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white p-5 shadow-sm max-[360px]:rounded-xl max-[360px]:p-3 max-[153px]:rounded-lg max-[153px]:p-2">
              <div className="mb-3 rounded-xl border border-gray-200 bg-white p-3 text-sm text-gray-700 max-[360px]:text-xs max-[153px]:mt-2 max-[153px]:rounded-md max-[153px]:p-1.5 max-[153px]:text-[9px]">
                <p className="font-medium text-gray-800 max-[153px]:text-[9px]">设置月经周期及天数</p>
                <div className="mt-2 flex items-center gap-2 max-[153px]:mt-1 max-[153px]:gap-1">
                  <span>月经周期</span>
                  <input
                    type="number"
                    min={20}
                    max={45}
                    value={data.cycleLength}
                    onChange={(e) => updateCycleSetting(Number(e.target.value), data.periodLength)}
                    className="h-9 w-16 rounded-lg border border-gray-200 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-rose-200 max-[360px]:h-8 max-[360px]:text-xs max-[153px]:h-6 max-[153px]:w-10 max-[153px]:rounded-md max-[153px]:px-1 max-[153px]:py-0.5 max-[153px]:text-[9px]"
                  />
                  <span>天</span>
                </div>
                <div className="mt-2 flex items-center gap-2 max-[153px]:mt-1 max-[153px]:gap-1">
                  <span>月经持续天数</span>
                  <input
                    type="number"
                    min={2}
                    max={10}
                    value={data.periodLength}
                    onChange={(e) => updateCycleSetting(data.cycleLength, Number(e.target.value))}
                    className="h-9 w-16 rounded-lg border border-gray-200 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-rose-200 max-[360px]:h-8 max-[360px]:text-xs max-[153px]:h-6 max-[153px]:w-10 max-[153px]:rounded-md max-[153px]:px-1 max-[153px]:py-0.5 max-[153px]:text-[9px]"
                  />
                  <span>天</span>
                </div>
              </div>
              <div className="mb-4 rounded-xl border border-rose-100 bg-rose-50 p-3 text-sm leading-relaxed text-gray-700 max-[360px]:mb-3 max-[360px]:text-xs max-[153px]:mb-2 max-[153px]:rounded-md max-[153px]:p-1.5 max-[153px]:text-[9px]">
                平均周期 {avgCycle.toFixed(1)} 天，平均经期时长 {avgDuration.toFixed(1)} 天。
                <p className="mt-1 text-xs text-gray-500 max-[153px]:text-[8px]">
                  *以上的平均周期和平均经期时长是根据用户历史记录计算出的均值。
                </p>
              </div>
              <div className="space-y-2">
                {historyByYear.map(([year, rows]) => (
                  <div key={year} className="rounded-xl border border-gray-100 bg-white p-2">
                    <button
                      type="button"
                      onClick={() => setHistoryYearOpen((prev) => ({ ...prev, [year]: !prev[year] }))}
                      className="w-full text-left text-sm font-medium text-gray-800"
                    >
                      {year}年
                    </button>
                    {historyYearOpen[year] && (
                      <table className="mt-2 min-w-full text-left text-xs text-gray-600 max-[153px]:text-[8px]">
                        <thead>
                          <tr className="border-b border-gray-100 text-gray-800">
                            <th className="whitespace-nowrap px-2 py-2 font-medium">开始日期</th>
                            <th className="whitespace-nowrap px-2 py-2 font-medium">结束日期</th>
                            <th className="whitespace-nowrap px-2 py-2 font-medium">持续天数</th>
                            <th className="whitespace-nowrap px-2 py-2 font-medium">周期间隔</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((item) => (
                            <tr key={`${item.start}-${item.end}`} className="border-b border-gray-50">
                              <td className="whitespace-nowrap px-2 py-2">{toMd(item.start)}</td>
                              <td className="whitespace-nowrap px-2 py-2">{toMd(item.end)}</td>
                              <td className="whitespace-nowrap px-2 py-2">{item.durationDays}天</td>
                              <td className="whitespace-nowrap px-2 py-2">
                                {Number.isFinite(item.intervalDays) ? `${item.intervalDays}天` : "--"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function LegendItem({ colorClass, text }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`inline-block h-3 w-3 rounded-md ${colorClass}`} />
      <span className="whitespace-nowrap text-[11px] text-gray-600">{text}</span>
    </div>
  );
}

function getCalendarPhase({
  date,
  markedPeriodDates,
  periodRanges,
  hasValidCycleSetting,
  latestMarkedStart,
  cycleLengthNum,
  periodLengthNum,
}) {
  const ymd = toYmd(date);
  if (markedPeriodDates[ymd]) return "menstruation";

  if (periodRanges.length >= 2) {
    for (let i = 0; i < periodRanges.length - 1; i += 1) {
      const current = periodRanges[i];
      const next = periodRanges[i + 1];
      if (date >= current.startDate && date < next.startDate) {
        const intervalDays = daysBetween(current.startDate, next.startDate);
        const periodDays = Math.max(1, current.durationDays);
        const dayInCycle = daysBetween(current.startDate, date) + 1;
        if (dayInCycle <= periodDays) return "menstruation";
        const remaining = Math.max(1, intervalDays - periodDays);
        const follicularDays = Math.max(4, Math.floor(remaining * 0.45));
        if (dayInCycle <= periodDays + follicularDays) return "follicular";
        return "luteal";
      }
    }
  }

  if (!hasValidCycleSetting || !latestMarkedStart) return null;
  const phase = getPhaseByDate(date, cycleLengthNum, periodLengthNum, latestMarkedStart);
  return phase === "prediction" ? "prediction" : null;
}

function getPhaseByDate(date, cycleLength, periodLength, latestRecordStart) {
  const safeCycle = Math.max(20, cycleLength);
  const safePeriod = Math.min(Math.max(2, periodLength), 10);
  const follicularLength = Math.max(6, Math.floor((safeCycle - safePeriod) * 0.35));
  const targetDate = startOfDay(date);
  const lastStart = startOfDay(latestRecordStart);

  const daysSinceLastStart = Math.floor((targetDate - lastStart) / (1000 * 60 * 60 * 24));

  // 如果目标日期在上一个周期内
  if (daysSinceLastStart < safeCycle) {
    if (daysSinceLastStart < safePeriod) return "menstruation";
    if (daysSinceLastStart < safePeriod + follicularLength) return "follicular";
  }

  // 否则检查是否在下一个周期的预测范围内
  const nextPredictedStart = new Date(lastStart);
  nextPredictedStart.setDate(nextPredictedStart.getDate() + safeCycle);

  const predictionEnd = new Date(nextPredictedStart);
  predictionEnd.setDate(predictionEnd.getDate() + safePeriod - 1);

  const isInPredictionRange = targetDate >= nextPredictedStart && targetDate <= predictionEnd;
  if (isInPredictionRange) return "prediction";

  return "luteal";
}

function getPhaseContent(phase) {
  if (!phase) {
    return {
      title: "已选择日期",
      bgClass: "bg-white",
      whatIs: "请先在下方选择\"是否为月经期\"，再点击日历日期进行标记。",
      hormones: ["填写\"设置月经周期及天数\"后，系统会按你的设置自动计算周期变化。"],
      bodyFeelings: [],
      principle: "预测仅作为记录辅助，不替代医学建议。",
    };
  }
  if (phase === "menstruation") {
    return {
      title: "月经期 — 身体正在清理与重置",
      bgClass: "bg-rose-50",
      whatIs: "月经来潮的阶段，通常持续约3-7天，是子宫内膜脱落排出的过程。",
      hormones: [
        "雌激素下降 → 可能感到精力下降、情绪更敏感。",
        "孕激素下降 → 子宫内膜开始脱落，形成经血。",
        "前列腺素上升 → 可能出现腹痛、腰酸。",
      ],
      bodyFeelings: [
        "有些人会感到身体疲乏，需要更多休息。",
        "有些人会情绪波动或更容易感到焦虑。",
        "有些人会出现腹痛、腰酸、乳房胀痛。",
        "有些人食欲会发生变化，偏好甜食或咸食。",
      ],
      principle:
        "如果没有受精，黄体退化，雌激素和孕激素下降，子宫内膜失去支撑而脱落形成月经，同时身体进入\"清理与重置\"状态。",
    };
  }

  if (phase === "follicular") {
    return {
      title: "卵泡期 — 身体正在悄悄为下一次可能做准备",
      bgClass: "bg-emerald-50",
      whatIs: "月经结束后到排卵前的阶段，通常持续约7-14天。",
      hormones: [
        "雌激素逐渐上升 → 精力恢复、内膜修复。",
        "FSH（促卵泡激素）上升 → 卵泡发育。",
        "血清素较稳定或略上升 → 情绪更平稳。",
      ],
      bodyFeelings: [
        "有些人会感到精力充沛，适合运动或开始新计划。",
        "有些人皮肤状态可能变好，气色更佳。",
        "有些人情绪会更稳定，社交意愿增强。",
        "有些人食欲会趋于平衡。",
      ],
      principle:
        "月经结束后身体进入恢复阶段，卵巢在FSH作用下开始培养多个卵泡，其中一个优势卵泡逐渐成熟，同时雌激素上升，为排卵和子宫内膜增厚做准备。",
    };
  }

  if (phase === "luteal") {
    return {
      title: "黄体期 — 身体正在维持稳定",
      bgClass: "bg-amber-50",
      whatIs: "排卵后到下一次月经来潮前的阶段，通常持续约12-14天。",
      hormones: [
        "孕激素上升 → 维持体温、稳定子宫内膜。",
        "雌激素中等水平。",
        "若未受孕 → 孕激素和雌激素同时下降。",
      ],
      bodyFeelings: [
        "有些人会感到体温轻微上升，更容易燥热。",
        "有些人皮肤可能出油增加或长痘痘。",
        "有些人情绪可能变得敏感，容易烦躁或低落。",
        "有些人食欲会增加，尤其是对高热量食物的渴望。",
      ],
      principle:
        "排卵后卵泡转化为黄体，分泌孕激素让子宫内膜变厚并维持稳定，为受精卵着床做准备；如果没有受孕，黄体退化，激素下降，进入下一次月经。",
    };
  }

  return {
    title: "预测月经期",
    bgClass: "bg-rose-50",
    whatIs: "接近下一次月经来潮的预测窗口，可提前关注休息与补水。",
    hormones: ["激素水平正在变化，身体可能逐步进入下一轮周期。"],
    bodyFeelings: [
      "有些人会感到身体开始出现经前不适。",
      "有些人情绪可能会变得敏感。",
    ],
    principle: "预测仅作参考，实际周期会受到睡眠、压力、饮食等因素影响。",
  };
}

function getDayColorClass(phase) {
  if (!phase) return "bg-white border-gray-100 text-gray-700";
  switch (phase) {
    case "menstruation":
      return "bg-rose-200 border-rose-200 text-gray-700";
    case "follicular":
      return "bg-emerald-100 border-emerald-100 text-gray-700";
    case "luteal":
      return "bg-amber-100 border-amber-100 text-gray-700";
    default:
      return "bg-white border-dashed border-rose-300 text-gray-700";
  }
}

function isSameDate(dateA, dateB) {
  return (
    dateA.getFullYear() === dateB.getFullYear() &&
    dateA.getMonth() === dateB.getMonth() &&
    dateA.getDate() === dateB.getDate()
  );
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function mod(value, n) {
  return ((value % n) + n) % n;
}

function average(list) {
  if (!list.length) return 0;
  const sum = list.reduce((total, num) => total + num, 0);
  return sum / list.length;
}

function toYmd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseYmd(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function toMd(ymd) {
  const [, m, d] = ymd.split("-").map(Number);
  return `${m}/${d}`;
}

function groupHistoryByYear(historyData) {
  const map = new Map();
  historyData.forEach((item) => {
    const year = Number(item.start.split("-")[0]);
    if (!map.has(year)) map.set(year, []);
    map.get(year).push(item);
  });
  return Array.from(map.entries()).sort((a, b) => b[0] - a[0]);
}

function buildPeriodRanges(markedPeriodDates) {
  const dates = Object.keys(markedPeriodDates)
    .filter((key) => markedPeriodDates[key])
    .sort();

  if (!dates.length) return [];
  const ranges = [];
  let start = parseYmd(dates[0]);
  let end = parseYmd(dates[0]);

  for (let i = 1; i < dates.length; i += 1) {
    const current = parseYmd(dates[i]);
    const diff = daysBetween(end, current);
    if (diff <= 1) {
      end = current;
      continue;
    }
    ranges.push({
      startDate: startOfDay(start),
      endDate: startOfDay(end),
      start: toYmd(start),
      end: toYmd(end),
      durationDays: daysBetween(start, end) + 1,
    });
    start = current;
    end = current;
  }

  ranges.push({
    startDate: startOfDay(start),
    endDate: startOfDay(end),
    start: toYmd(start),
    end: toYmd(end),
    durationDays: daysBetween(start, end) + 1,
  });
  return ranges;
}

function buildHistoryFromRanges(periodRanges) {
  const reversed = [...periodRanges].reverse();
  return reversed.map((range, index) => {
    const previous = reversed[index + 1];
    return {
      start: range.start,
      end: range.end,
      durationDays: range.durationDays,
      intervalDays: previous ? daysBetween(previous.startDate, range.startDate) : null,
    };
  });
}

function daysBetween(dateA, dateB) {
  return Math.floor((startOfDay(dateB) - startOfDay(dateA)) / (1000 * 60 * 60 * 24));
}
