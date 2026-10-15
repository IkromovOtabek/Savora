export default function AppLoading() {
  return (
    <div className="t-skel" role="status" aria-busy="true" aria-label="Yuklanmoqda">
      <div className="t-skel-block t-skel-title" />
      <div className="t-skel-block t-skel-sub" />
      <div className="t-skel-kpis">
        <div className="t-skel-block t-skel-kpi" />
        <div className="t-skel-block t-skel-kpi" />
        <div className="t-skel-block t-skel-kpi" />
        <div className="t-skel-block t-skel-kpi" />
      </div>
      <div className="t-skel-list">
        {[0, 1, 2, 3, 4].map((i) => (
          <div className="t-skel-row" key={i}>
            <div className="t-skel-block t-skel-sq" />
            <div className="t-skel-block t-skel-line" />
            <div className="t-skel-block t-skel-amt" />
          </div>
        ))}
      </div>
    </div>
  );
}
