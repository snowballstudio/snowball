import './Nutrition.css'

export default function Nutrition({
  PngSequence,
  dailyTasteStats,
  dailyNutritionStats,
  nutritionMotionOn,
  nutritionTasteLine,
  dailyStatRange,
  setDailyStatRange,
  dailyRangeTabs,
  openDailyDetail,
  onBackHome,
}) {
  const safePercent = Math.max(0, Math.min(100, Number(dailyTasteStats?.rainbowPercent || 0)))

  return (
    <div className="dailyPage dailySubPage dailyNutritionPage nutritionPage">
      <div className="nutritionSubTop">
        <button type="button" className="nutritionBackBtn" onClick={onBackHome} aria-label="返回主页">‹</button>
        <h2 className="dailyPlainTitle nutritionTitle">营养光谱</h2>
      </div>

      <div className="dailyInsightCard nutritionSpectrumCard">
        <img className="dailyInsightBg nutritionBg" src="/refine/nutritiion_default_background.png" alt="营养光谱背景" />

        {nutritionMotionOn ? (
          <PngSequence
            className="dailyInsightCat nutritionInsightCat nutritionInsightCatMotion"
            prefix="/refine/things"
            maxFrames={13}
            frameMs={260}
            fallback="/refine/things01.png"
            ariaLabel="营养光谱动起来的雪粒"
          />
        ) : (
          <img className="dailyInsightCat nutritionInsightCat" src="/refine/nutrition_default_cat.png" alt="营养光谱雪粒" />
        )}

        <div className="dailyInsightContent nutritionInsightContent">
          {dailyTasteStats?.rainbowVisible ? (
            <>
              <div
                className="rainbowSpectrum"
                aria-hidden="true"
                style={{ '--rainbow-visible': `${safePercent}%` }}
              >
                <div className="rainbowArcLayer" aria-hidden="true">
                  {dailyNutritionStats.map((item, index) => (
                    <div
                      key={item.key}
                      className={`rainbowArc rainbowArc${index + 1} ${item.level}`}
                      style={{ '--arc-score': `${Math.max(18, item.score)}%` }}
                    />
                  ))}
                </div>
              </div>
              <div className="rainbowLabelStack" aria-hidden="true">
                {dailyNutritionStats.map((item, index) => (
                  <span key={`label-${item.key}`} className={`rainbowBandLabel rainbowBandLabel${index + 1}`}>{item.label}</span>
                ))}
              </div>
            </>
          ) : null}

          {!nutritionMotionOn && (
            <div className="nutritionCloudNote" aria-live="polite">
              <img src="/refine/cloud_note.png" alt="" aria-hidden="true" />
              <span>{nutritionTasteLine}</span>
            </div>
          )}

          <div className="dailyCornerTable dailyCornerTableRight nutritionTablePanel">
            <div className="nutritionTableNavLine">
              <div className="dailyRangeTabs nutritionRangeTabs">
                {dailyRangeTabs.map(tab => (
                  <button key={tab.key} className={dailyStatRange === tab.key ? 'active' : ''} onClick={() => setDailyStatRange(tab.key)}>{tab.label}</button>
                ))}
              </div>
              <button type="button" className="dailyTextLinkBtn nutritionDetailLink" onClick={() => openDailyDetail('food')}>查看饮食详情</button>
            </div>
            <div className="dailyMiniTable nutritionMiniTable nutritionMiniTableThreeCol">
              {dailyNutritionStats.map(item => (
                <div className="dailyMiniRow" key={item.key}>
                  <span>{item.label}</span>
                  <strong>{item.display}</strong>
                  <em title={item.topFoods}>{item.topFoods}</em>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
