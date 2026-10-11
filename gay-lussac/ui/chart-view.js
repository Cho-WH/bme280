export function createChartView(canvas) {
  if (!globalThis.Chart) throw new Error('그래프 도구를 불러오지 못했어요. 화면을 새로 열어 주세요.');
  const chart = new globalThis.Chart(canvas, {
    type: 'line',
    data: { datasets: [
      { label: '온도 (℃)', yAxisID: 'temperature', borderColor: '#d67b40', backgroundColor: '#d67b40', data: [] },
      { label: '압력 (hPa)', yAxisID: 'pressure', borderColor: '#197f88', backgroundColor: '#197f88', data: [] },
    ] },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      parsing: false, spanGaps: false,
      elements: { point: { radius: 0, hitRadius: 8 }, line: { borderWidth: 2 } },
      plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 7, font: { size: 13 } } } },
      scales: {
        x: { type: 'linear', min: -60, max: 0, title: { display: true, text: '지금으로부터 (초)' }, grid: { color: '#edf1f2' } },
        temperature: { type: 'linear', position: 'left', title: { display: true, text: '온도 (℃)' }, grid: { color: '#edf1f2' } },
        pressure: { type: 'linear', position: 'right', title: { display: true, text: '압력 (hPa)' }, grid: { drawOnChartArea: false } },
      },
    },
  });
  return {
    render(points, now) {
      for (const [index, field] of ['temperatureC', 'pressureHpa'].entries()) {
        const data = [];
        let previous;
        for (const point of points) {
          const x = (point.monotonicAt - now) / 1000;
          if (previous && previous.segmentId !== point.segmentId) data.push({ x, y: null });
          data.push({ x, y: point.validity[field] === 'valid' ? point[field] : null });
          previous = point;
        }
        chart.data.datasets[index].data = data;
      }
      chart.update('none');
    },
    resize() { chart.resize(); },
    exportPng() { return chart.toBase64Image(); },
    dispose() { chart.destroy(); },
  };
}
