import { useMemo, useState } from 'react'
import './Footprint.css'
import { MapArtwork } from './components/SnowballShared'

export default function Footprint({
  PngSequence,
  MOTION,
  YEARS_SCENES,
  FOOTPRINT_TYPES,
  FOOTPRINT_POSITIONS,
  yearsMode,
  setYearsMode,
  footprintView,
  setFootprintView,
  updateFootprintDraft,
  pickHomePosition,
  pendingHomePosition,
  activeHomePosition,
  footprintCatRoute,
  placeOptions,
  fallbackFootprintPosition,
  footprintDraft,
  chooseFootprintPlace,
  pickFootprintDraftPosition,
  footprintMarkerGroups,
  footprintPosition,
  selectedFootprintId,
  setSelectedFootprintId,
  selectedFootprint,
  setFootprintImagePreview,
  startEditFootprint,
  requestDeleteFootprint,
  saveHomePosition,
  cancelSetHomePosition,
  data,
  setData,
  currentFootprintType,
  currentPlaceOptions,
  placeInputValid,
  askSnowballFootprintMemory,
  handleFootprintPhotos,
  removeFootprintPhoto,
  saveFootprint,
  cancelFootprintEdit,
  footprints,
  startAddFootprint,
  startSetHomePosition,
  yearsScene,
  footprintSentence,
  homeFloatingFootprintMemory,
  handleCustomYearsSceneImage,
  setCustomFootprintScene,
  setShowYearsPanel,
  openCurrentFootprintMode,
  footprintModal,
  setFootprintModal,
  footprintImagePreview,
}) {
  const [openYears, setOpenYears] = useState({})
  const [popupVisitIndex, setPopupVisitIndex] = useState(0)

  const footprintTypeLabel = type => FOOTPRINT_TYPES[type] || type || '足迹'

  const sortedFootprints = useMemo(() => {
    return [...(footprints || [])].sort((a, b) => {
      const ay = Number(a.year || 0)
      const by = Number(b.year || 0)
      if (by !== ay) return by - ay
      const am = Number(a.month || 0)
      const bm = Number(b.month || 0)
      if (bm !== am) return bm - am
      return String(b.id || '').localeCompare(String(a.id || ''))
    })
  }, [footprints])

  const totalFootprints = sortedFootprints.length
  const shouldCollapseYears = totalFootprints > 10

  const footprintsByYear = useMemo(() => {
    const groups = new Map()
    sortedFootprints.forEach(item => {
      const year = String(item.year || '待记录')
      if (!groups.has(year)) groups.set(year, [])
      groups.get(year).push(item)
    })
    return Array.from(groups.entries()).map(([year, items]) => ({ year, items }))
  }, [sortedFootprints])

  const footprintRangeParts = useMemo(() => {
    const dated = sortedFootprints
      .filter(item => Number(item.year || 0))
      .map(item => ({ y: Number(item.year || 0), m: Number(item.month || 1) || 1 }))
      .sort((a, b) => a.y === b.y ? a.m - b.m : a.y - b.y)
    if (!dated.length) return null
    return { first: dated[0], last: dated[dated.length - 1] }
  }, [sortedFootprints])

  const footprintRangeText = useMemo(() => {
    if (!footprintRangeParts) return '尚未开始记录'
    const { first, last } = footprintRangeParts
    return `从${first.y}年${first.m}月到${last.y}年${last.m}月`
  }, [footprintRangeParts])

  const uniquePlaces = useMemo(() => {
    return new Set(sortedFootprints.map(item => `${item.type || 'local'}-${item.place || ''}`).filter(Boolean)).size
  }, [sortedFootprints])

  function yearTopPlaces(items) {
    const counts = new Map()
    items.forEach(item => {
      const place = item.place || '待记录'
      counts.set(place, (counts.get(place) || 0) + 1)
    })
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([place]) => place)
      .join(' · ')
  }

  const currentYear = String(new Date().getFullYear())

  function isYearOpen(year) {
    if (Object.prototype.hasOwnProperty.call(openYears, year)) {
      return Boolean(openYears[year])
    }
    if (String(year) === currentYear) return true
    const group = footprintsByYear.find(g => g.year === String(year))
    if (!group) return true
    return group.items.length <= 5
  }

 function toggleYear(year) {
  setOpenYears(prev => {
    const currentlyOpen = Object.prototype.hasOwnProperty.call(prev, year)
      ? Boolean(prev[year])
      : isYearOpen(year)

    return {
      ...prev,
      [year]: !currentlyOpen,
    }
  })
}

  function openFootprintRecord(item) {
    setFootprintView(item.type || 'local')
    setSelectedFootprintId(item.id)
    setYearsMode('browseFull')
  }

  function openFootprintMap(type) {
    setFootprintView(type)
    setSelectedFootprintId(null)
    setYearsMode('browseFull')
  }

  function changeFootprintScene(value) {
    if (value === 'custom') {
      setCustomFootprintScene()
      return
    }
    setFootprintModal(null)
    setData(prev => ({ ...prev, yearsScene: value, customYearsSceneImage: '', lastSavedAt: Date.now() }))
  }

  function draftFootprintPosition() {
    const draft = footprintDraft || {}
    const type = draft.type || footprintView
    const place = String(draft.place || '').trim()
    if (!place || !placeOptions(type).includes(place)) return null
    if (draft.positionMode === 'manual' && Number.isFinite(Number(draft.x)) && Number.isFinite(Number(draft.y))) {
      return { x: Number(draft.x), y: Number(draft.y), manual: true }
    }
    const pos = FOOTPRINT_POSITIONS[type]?.[place] || fallbackFootprintPosition(type, place)
    return { ...pos, manual: false }
  }

  function popupRecordSort(a, b) {
    const ay = Number(a?.year || 0)
    const by = Number(b?.year || 0)
    if (by !== ay) return by - ay

    const am = Number(a?.month || 0)
    const bm = Number(b?.month || 0)
    if (bm !== am) return bm - am

    return String(b?.id || '').localeCompare(String(a?.id || ''))
  }

  function popupDistance(a, b) {
    const dx = Number(a?.x || 0) - Number(b?.x || 0)
    const dy = Number(a?.y || 0) - Number(b?.y || 0)
    return Math.sqrt(dx * dx + dy * dy)
  }

  const selectedMarkerGroup = useMemo(() => {
    if (!selectedFootprintId) return null

    return (footprintMarkerGroups || []).find(group => {
      if (group.item?.id === selectedFootprintId) return true
      const selected = (footprints || []).find(item => item.id === selectedFootprintId)
      if (!selected) return false
      return popupDistance(group.pos, footprintPosition(selected)) <= 5
    }) || null
  }, [selectedFootprintId, footprintMarkerGroups, footprints])

  const selectedMarkerVisits = useMemo(() => {
    if (!selectedMarkerGroup) {
      return selectedFootprint ? [selectedFootprint] : []
    }

    return (footprints || [])
      .filter(item => item.type === footprintView)
      .filter(item => popupDistance(footprintPosition(item), selectedMarkerGroup.pos) <= 5)
      .sort(popupRecordSort)
  }, [selectedMarkerGroup, selectedFootprint, footprints, footprintView])

  const popupVisitSafeIndex = selectedMarkerVisits.length
    ? Math.min(popupVisitIndex, selectedMarkerVisits.length - 1)
    : 0

  const popupFootprint = selectedMarkerVisits[popupVisitSafeIndex] || selectedFootprint || null

  function openMarkerGroup(group) {
    const visits = (footprints || [])
      .filter(item => item.type === footprintView)
      .filter(item => popupDistance(footprintPosition(item), group.pos) <= 5)
      .sort(popupRecordSort)

    setPopupVisitIndex(0)
    setSelectedFootprintId(visits[0]?.id || group.item.id)
  }

  function closeFootprintPopup() {
    setPopupVisitIndex(0)
    setSelectedFootprintId(null)
  }

  function showPreviousVisit() {
    setPopupVisitIndex(index => Math.max(0, index - 1))
  }

  function showNextVisit() {
    setPopupVisitIndex(index => Math.min(selectedMarkerVisits.length - 1, index + 1))
  }

  return (
    <>
      <div className="yearsOverlay">
        {yearsMode === 'addMap' || yearsMode === 'browseFull' || yearsMode === 'setHome' ? (
          <div className={`footprintFullPage ${yearsMode === 'addMap' ? 'footprintAddMode' : yearsMode === 'setHome' ? 'footprintHomeMode' : 'footprintBrowseMode'}`}>
            <div className="footprintFullTop footprintTopBar">
              {(yearsMode === 'browseFull' || yearsMode === 'setHome') && (
                <button type="button" className="footprintBackText" onClick={() => setYearsMode('home')} aria-label="返回足迹">‹</button>
              )}
              <div className="footprintTabs footprintFullTabs footprintTextTabs">
                {Object.entries(FOOTPRINT_TYPES).map(([key, label]) => (
                  <button
                    key={key}
                    className={footprintView === key ? 'active' : ''}
                    onClick={() => {
                      setFootprintView(key)
                      if (yearsMode === 'addMap') updateFootprintDraft('type', key)
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
      
            <div className="footprintMapLayout">
              <div
                className={`simpleMap fullMap ${footprintView} ${yearsMode === 'addMap' || yearsMode === 'setHome' ? 'mapEditingActive' : ''} ${yearsMode === 'addMap' && !footprintDraft.place ? 'mapEditingPlaceEmpty' : ''} ${yearsMode === 'setHome' ? 'mapHomePickingActive' : ''}`}
                onClick={yearsMode === 'setHome' ? pickHomePosition : yearsMode === 'addMap' ? pickFootprintDraftPosition : undefined}
              >
                <MapArtwork type={footprintView} />
                {yearsMode === 'setHome' && pendingHomePosition && (
                  <span
                    className="footprintHomeMarker footprintHomeMarkerPending"
                    style={{ left: `${pendingHomePosition.x}%`, top: `${pendingHomePosition.y}%` }}
                    title="新的家"
                    aria-label="新的家"
                  ></span>
                )}
                {yearsMode === 'browseFull' && activeHomePosition && footprintCatRoute.length >= 2 && (
                  <svg className="footprintFlightPath" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                    {footprintCatRoute.slice(1, 3).map((point, index) => {
                      const home = footprintCatRoute[0]
                      return (
                        <path
                          key={index}
                          d={`M ${home.x} ${home.y} Q ${(home.x + point.x) / 2} ${Math.min(home.y, point.y) - 12} ${point.x} ${point.y}`}
                        />
                      )
                    })}
                  </svg>
                )}
                {yearsMode === 'addMap' && placeOptions(footprintView).map(place => {
                  const pos = FOOTPRINT_POSITIONS[footprintView]?.[place] || fallbackFootprintPosition(footprintView, place)
                  return (
                    <button
                      key={place}                      
        className={`mapPlaceButton mapChoiceButton ${footprintDraft.place === place ? 'active choiceSettled' : ''}`}
        style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
        onClick={e => chooseFootprintPlace(footprintView, place, e)}                   
                      title={`选择 ${place}`}
                      aria-label={`选择 ${place}`}
                    >
                      {place}
                    </button>
                  )
                })}
                {yearsMode === 'addMap' && (() => {
                  const pos = draftFootprintPosition()
                  if (!pos) return null
                  return (
                    <span
                      className={`footprintPin footprintPin-1 active footprintDraftPin ${pos.manual ? 'manual' : 'default'}`}
                      style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                      title={pos.manual ? '手动定位点' : '默认定位点'}
                      aria-label={pos.manual ? '手动定位点' : '默认定位点'}
                    />
                  )
                })()}
                {footprintMarkerGroups.map(group => {
                  const pos = footprintPosition(group.item)
                  const pinLevel = Math.min(5, Math.max(1, group.count))
                  return (
                    <button
                      key={group.key}
                      className={`footprintPin footprintPin-${pinLevel} ${selectedFootprintId === group.item.id ? 'active' : ''}`}
                      style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                      title={`${group.item.place} · ${group.count}次`}
                      onClick={() => openMarkerGroup(group)}
                      aria-label={`${group.item.place}，去过${group.count}次`}
                    />
                  )
                })}
                {yearsMode === 'browseFull' && activeHomePosition && footprintCatRoute.length > 0 && (
                  <img
                    key={`${footprintView}-${footprintCatRoute[0]?.x}-${footprintCatRoute[0]?.y}`}
                    className="footprintMapStaticCat"
                    src="/refine/footprint_background_cat.png"
                    alt="雪粒停在家里"
                    style={{
                      '--fp-cat-route-x1': `${footprintCatRoute[0]?.x || 28}%`,
                      '--fp-cat-route-y1': `${footprintCatRoute[0]?.y || 62}%`,
                      '--fp-cat-route-x2': `${footprintCatRoute[1]?.x || 74}%`,
                      '--fp-cat-route-y2': `${footprintCatRoute[1]?.y || 58}%`,
                    }}
                    onError={e => { e.currentTarget.src = '/snowball2.png' }}
                  />
                )}
                {yearsMode === 'browseFull' && popupFootprint && (() => {
                  const pos = footprintPosition(popupFootprint)
                  const hasMultipleVisits = selectedMarkerVisits.length > 1

                  return (
                    <div className="mapFootprintPopup">
                      <button className="mapFootprintPopupClose" onClick={closeFootprintPopup} aria-label="关闭足迹详情">×</button>

                      <div className="mapFootprintPopupHeader">
                        <strong><span>{popupFootprint.year || '待记录'}年{popupFootprint.month || '待记录'}月 · {popupFootprint.place || '待记录'}</span></strong>

                        {hasMultipleVisits && (
                          <div className="mapFootprintPager" aria-label="切换同一图钉的足迹记录">
                            <button
                              type="button"
                              onClick={showPreviousVisit}
                              disabled={popupVisitSafeIndex === 0}
                              aria-label="查看更新的一次足迹"
                            >
                              ‹
                            </button>
                            <span>{popupVisitSafeIndex + 1}/{selectedMarkerVisits.length}</span>
                            <button
                              type="button"
                              onClick={showNextVisit}
                              disabled={popupVisitSafeIndex >= selectedMarkerVisits.length - 1}
                              aria-label="查看更早的一次足迹"
                            >
                              ›
                            </button>
                          </div>
                        )}
                      </div>

                      <p>具体地点：{popupFootprint.detail || '待记录'}</p>
                      <p>最难忘的：{popupFootprint.note || '待记录'}</p>
                      {Array.isArray(popupFootprint.photos) && popupFootprint.photos.length > 0 ? (
                        <div className="mapFootprintPhotos">
                          {popupFootprint.photos.slice(0, 3).map((src, index) => (
                            <button type="button" className="mapFootprintPhotoButton" key={index} onClick={() => setFootprintImagePreview(src)} aria-label={`放大查看足迹照片${index + 1}`}>
                              <img src={src} alt={`足迹照片${index + 1}`} />
                            </button>
                          ))}
                        </div>
                      ) : (
                        <small className="mapFootprintNoPhoto">图片：待记录</small>
                      )}
                      <div className="mapFootprintPopupActions">
                        <button type="button" onClick={() => startEditFootprint(popupFootprint)}>编辑</button>
                        <button type="button" className="danger" onClick={() => requestDeleteFootprint(popupFootprint)}>删除</button>
                      </div>
                    </div>
                  )
                })()}
                
              </div>
      
              {yearsMode === 'setHome' ? (
                <div className="yearsCard footprintEditorCard footprintHomeSetCard">
                  <p className="footprintTip">请在地图上点击家的位置。保存后，雪粒会从这里出发。</p>
                  <div className="footprintHomeSetPreview">
                    {pendingHomePosition ? `当前位置：${pendingHomePosition.x}%，${pendingHomePosition.y}%` : '还没有选择位置'}
                  </div>
                  <div className="footprintSaveActions">
                    <button className="saveFootprintBtn" disabled={!pendingHomePosition} onClick={saveHomePosition}>保存住址</button>
                    <button type="button" className="saveFootprintBtn footprintCancelBtn" onClick={cancelSetHomePosition}>取消</button>
                  </div>
                </div>
              ) : yearsMode === 'addMap' ? (
                <div className="yearsCard footprintEditorCard">
                  <p className="footprintTip">可输入地名或在地图上点精确方位添加足迹。</p>
                  <div className="footprintField footprintYearMonthField">
                    <span>年月</span>
                    <div className="footprintInlinePair">
                      <input
                        placeholder="如：2026"
                        value={(data.footprintDraft || {}).year || ''}
                        onChange={e => updateFootprintDraft('year', e.target.value)}
                      />
                      <input
                        placeholder="如：6"
                        value={(data.footprintDraft || {}).month || ''}
                        onChange={e => updateFootprintDraft('month', e.target.value)}
                      />
                    </div>
                  </div>
                  <label className="footprintField">
                    <span>地方区域</span>
                    <span className="footprintFieldControl">
                      <input
                        list={`footprint-place-list-${currentFootprintType}`}
                        placeholder={currentFootprintType === 'world' ? '如：英国' : currentFootprintType === 'china' ? '省或直辖市' : '海边 / 公园 / 餐饮 / 商场 / 展馆 / 亲友'}
                        value={footprintDraft.place || ''}
                        onChange={e => updateFootprintDraft('place', e.target.value)}
                      />
                      <datalist id={`footprint-place-list-${currentFootprintType}`}>
                        {currentPlaceOptions.map(place => <option key={place} value={place} />)}
                      </datalist>
                      {!placeInputValid && <small className="footprintHint">请选择列表里的固定地点，具体地点写在下一栏。</small>}
                    </span>
                  </label>
                  <label className="footprintField">
                    <span>具体地点</span>
                    <input
                      placeholder="如：小城、店名、路名"
                      value={footprintDraft.detail || ''}
                      onChange={e => updateFootprintDraft('detail', e.target.value)}
                    />
                  </label>
                  <label className="footprintField footprintNoteField">
                    <span>最难忘的</span>
                    <textarea
                      className="footprintNoteTextarea"
                      rows={4}
                      placeholder="如：事件，人物，心境"
                      value={footprintDraft.note || ''}
                      onChange={e => updateFootprintDraft('note', e.target.value)}
                    />
                  </label>
                  <div className="footprintMemoryUploadRow">
                    <label className="footprintPhotoInline">
                      <span>上传图片</span>
                      <input
                        className="footprintPhotoNativeInput"
                        type="file"
                        accept="image/*"
                        multiple
                        aria-label="上传足迹图片，最多3张"
                        onChange={e => { handleFootprintPhotos(e.target.files); e.target.value = '' }}
                      />
                    </label>
                    <button type="button" className="askSnowballMemoryBtn" onClick={askSnowballFootprintMemory}>? 问问雪粒帮忙回忆</button>
                  </div>
                  {(footprintDraft.photos || []).length > 0 && (
                    <div className="footprintPhotoPreviewGrid">
                      {(footprintDraft.photos || []).map((src, index) => (
                        <div className="footprintPhotoPreview" key={index}>
                          <img src={src} alt={`足迹照片${index + 1}`} />
                          <button type="button" onClick={() => removeFootprintPhoto(index)}>删除</button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="footprintSaveActions">
                    <button className="saveFootprintBtn" disabled={!placeInputValid || !footprintDraft.place || !footprintDraft.year || !footprintDraft.month} onClick={saveFootprint}>保存</button>
                    <button type="button" className="saveFootprintBtn footprintCancelBtn" onClick={cancelFootprintEdit}>放弃</button>
                  </div>
                </div>
              ) : (
                <div className="yearsCard footprintEditorCard footprintBrowseListCard">
                  <p className="footprintTip">点击图钉或下方记录，查看足迹详情。</p>
                  <div className="footprintFullList compactFootprintList">
                    {footprints.filter(item => item.type === footprintView).length === 0 && <p>这里还没有足迹。</p>}
                    {footprints.filter(item => item.type === footprintView).map(item => {
                      const thumb = Array.isArray(item.photos) && item.photos.length > 0 ? item.photos[0] : ''
                      return (
                        <button className={selectedFootprintId === item.id ? 'footprintListButton active footprintListRecord' : 'footprintListButton footprintListRecord'} key={item.id} onClick={() => { setPopupVisitIndex(0); setSelectedFootprintId(item.id) }}>
                          <span className="footprintListThumb">{thumb ? <img src={thumb} alt="" /> : <span>图</span>}</span>
                          <span className="footprintListText"><strong>{item.year}年{item.month}月 · {item.place}</strong>{item.detail ? <small>{item.detail}</small> : null}</span>
                        </button>
                      )
                    })}
                  </div>
                  <div className="footprintBrowseActions">
                    <button className="saveFootprintBtn footprintAddFromListBtn footprintIconTextButton" onClick={() => startAddFootprint(footprintView)}>
                      <img className="footprintSubActionIcon footprintSubActionEditIcon" src="/refine/footprint_icon_edit.png" alt="" aria-hidden="true" />
                      <span>添加足迹</span>
                    </button>
                    <button className="saveFootprintBtn footprintSetHomeBtn footprintIconTextButton" onClick={() => startSetHomePosition(footprintView)}>
                      <img className="footprintSubActionIcon footprintSubActionHomeIcon" src="/refine/footprint_icon_home.png" alt="" aria-hidden="true" />
                      <span>设置住址</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="yearsPanel footprintHomePanel">
            <div className={`footprintBgMover ${data.yearsScene === 'custom' ? 'footprintBgMoverCustom' : ''}`}>
              <img
                className={`yearsBg yearsBgA ${data.yearsScene === 'custom' ? 'yearsBgCustom' : ''}`}
                src={yearsScene.image}
                alt="足迹背景"
                onError={e => {
                  e.currentTarget.src = YEARS_SCENES.park.image
                  setData(prev => ({ ...prev, yearsScene: 'park', customYearsSceneImage: '' }))
                }}
              />
              <img
                className={`yearsBg yearsBgB ${data.yearsScene === 'custom' ? 'yearsBgCustom' : ''}`}
                src={yearsScene.image}
                alt=""
                aria-hidden="true"
              />
            </div>

            <button type="button" className="footprintHomeBack" onClick={() => setShowYearsPanel(false)} aria-label="返回主页">‹</button>

            <div className="yearsTitle yearsBlueText footprintHomeTitle">
              <h2>足迹地图</h2>
              <p>
                {footprintRangeParts ? (
                  <>
                    从<strong>{footprintRangeParts.first.y}</strong>年<strong>{footprintRangeParts.first.m}</strong>月到<strong>{footprintRangeParts.last.y}</strong>年<strong>{footprintRangeParts.last.m}</strong>月，你一共去过
                  </>
                ) : (
                  <>尚未开始记录，你一共去过</>
                )}
                <strong>{uniquePlaces}</strong>个地方，留下
                <strong>{totalFootprints}</strong>条足迹。
              </p>
            </div>

            <PngSequence
              className="yearsRunCat footprintHomeRunCat"
              prefix="/motion/run"
              maxFrames={13}
              frameMs={MOTION.frameMs.footprint}
              fallback="/refine/footprint_background_cat.png"
              ariaLabel="足迹主页里的雪粒"
            />

            <div className="footprintHomeContent">
              <div className="footprintSceneSetting">
                <label>
                  <span></span>
                  <select value={data.yearsScene || 'park'} onChange={e => changeFootprintScene(e.target.value)}>
                    {Object.entries(YEARS_SCENES).map(([key, scene]) => (
                      <option key={key} value={key}>{scene.label}</option>
                    ))}
                    <option value="custom">自定</option>
                  </select>
                </label>
              </div>
              {data.yearsScene === 'custom' && (
                <label className="customYearsBgButton footprintCustomBgText">
                  更换图片
                  <input
                    type="file"
                    accept="image/*"
                    onChange={e => { handleCustomYearsSceneImage(e.target.files); e.target.value = '' }}
                  />
                </label>
              )}

              <div className="footprintHistoryPanel">
                <h3></h3>
                {footprintsByYear.length === 0 ? (
                  <p className="footprintHistoryEmpty">还没有足迹。可以先进入地图，添加第一条记录。</p>
                ) : (
                  <div className="footprintYearList">
                    {footprintsByYear.map(group => {
                      const open = isYearOpen(group.year)
                      const topPlaces = yearTopPlaces(group.items)
                      return (
                        <section className={`footprintYearGroup ${open ? 'open' : 'collapsed'}`} key={group.year}>
                          <button type="button" className="footprintYearHeader" onClick={() => toggleYear(group.year)}>
                            <span>{open ? '−' : '+'} {group.year}年</span>
                            <small>去过 {group.items.length} 个地方{topPlaces ? ` · ${topPlaces}` : ''}</small>
                          </button>
                          {open && (
                            <div className="footprintYearItems">
                              {group.items.map(item => {
                                const thumb = Array.isArray(item.photos) && item.photos.length > 0 ? item.photos[0] : ''
                                return (
                                  <button type="button" className="footprintHomeRecord" key={item.id} onClick={() => openFootprintRecord(item)}>
                                    <span className="footprintHomeThumb">{thumb ? <img src={thumb} alt="" /> : <span>图</span>}</span>
                                    <span className="footprintHomeDate">{item.year || '待'}年{item.month || '待'}月</span>
                                    <strong>{item.place || '待记录'}</strong>
                                    <small className="footprintHomeDetail">{item.detail || ''}</small>
                                    <em>{footprintTypeLabel(item.type)}</em>
                                  </button>
                                )
                              })}
                            </div>
                          )}
                        </section>
                      )
                    })}
                  </div>
                )}
              </div>

              <div className="footprintMapTextLinks">
                <button type="button" className="footprintHomeMapLink" onClick={() => openFootprintMap('world')}>
                  <img className="footprintHomeMapIcon footprintHomeWorldIcon" src="/refine/footprint_icon_world.png" alt="" aria-hidden="true" />
                  <span>世界足迹</span>
                </button>
                <button type="button" className="footprintHomeMapLink" onClick={() => openFootprintMap('china')}>
                  <img className="footprintHomeMapIcon footprintHomeChinaIcon" src="/refine/footprint_icon_china.png" alt="" aria-hidden="true" />
                  <span>中国足迹</span>
                </button>
                <button type="button" className="footprintHomeMapLink" onClick={() => openFootprintMap('local')}>
                  <img className="footprintHomeMapIcon footprintHomeLocalIcon" src="/refine/footprint_icon_local.png" alt="" aria-hidden="true" />
                  <span>身边足迹</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {footprintModal && (
        <div className="footprintNoticeOverlay" onClick={() => setFootprintModal(null)}>
          <div className="footprintNoticeBox" onClick={e => e.stopPropagation()}>
            <button type="button" className="footprintNoticeClose" onClick={() => setFootprintModal(null)} aria-label="关闭提示">×</button>
            <h2>{footprintModal.title}</h2>
            <p>{footprintModal.text}</p>
          </div>
        </div>
      )}
      {footprintImagePreview && (
      <div className="imagePreviewOverlay" onClick={() => setFootprintImagePreview(null)}>
        <div className="imagePreviewBox" onClick={e => e.stopPropagation()}>
          <button className="imagePreviewClose" onClick={() => setFootprintImagePreview(null)} aria-label="关闭大图">×</button>
          <img src={footprintImagePreview} alt="足迹大图" />
        </div>
      </div>
      )}
    </>
  )
}
