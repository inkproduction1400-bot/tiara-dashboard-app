export function generateTimes() {
    const list: string[] = [];
    for (let h = 0; h < 30; h++) {     // 0:00〜29:50（翌5:00相当）
      for (let m = 0; m < 60; m += 10) {
        const hh = h.toString().padStart(2, "0");
        const mm = m.toString().padStart(2, "0");
        list.push(`${hh}:${mm}`);
      }
    }
    return list;
  }
  