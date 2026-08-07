import { useEffect, useMemo, useRef, useState } from 'react'
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
  openFootprintPhoto,
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
  const [footprintPopupMaximized, setFootprintPopupMaximized] = useState(false)
  const [browseSort, setBrowseSort] = useState({ field: 'date', direction: 'desc' })
  const [openFuturePlanType, setOpenFuturePlanType] = useState(null)
  const [showFootprintInfo, setShowFootprintInfo] = useState(false)
  const [futurePlanInputActive, setFuturePlanInputActive] = useState(false)
  const futurePlanTextareaRef = useRef(null)
  const futurePlanLayerRef = useRef(null)
  const futurePlanDragRef = useRef(null)

  const futurePlanImages = {
    world: '/refine/footprintbag_world.png',
    china: '/refine/footprintbag_china.png',
    local: '/refine/footprintbag_local.png',
  }


  useEffect(() => {
    if (!openFuturePlanType) {
      setFuturePlanInputActive(false)
      return undefined
    }

    const html = document.documentElement
    const body = document.body
    const scrollX = window.scrollX || 0
    const scrollY = window.scrollY || 0
    const previous = {
      htmlOverflow: html.style.overflow,
      htmlOverscrollBehavior: html.style.overscrollBehavior,
      bodyPosition: body.style.position,
      bodyTop: body.style.top,
      bodyLeft: body.style.left,
      bodyRight: body.style.right,
      bodyWidth: body.style.width,
      bodyOverflow: body.style.overflow,
      bodyOverscrollBehavior: body.style.overscrollBehavior,
    }

    html.classList.add('futureFootprintPlanOpen')
    body.classList.add('futureFootprintPlanOpen')
    html.style.overflow = 'hidden'
    html.style.overscrollBehavior = 'none'
    body.style.position = 'fixed'
    body.style.top = `-${scrollY}px`
    body.style.left = `-${scrollX}px`
    body.style.right = '0'
    body.style.width = '100%'
    body.style.overflow = 'hidden'
    body.style.overscrollBehavior = 'none'

    return () => {
      html.classList.remove('futureFootprintPlanOpen')
      body.classList.remove('futureFootprintPlanOpen')
      html.style.overflow = previous.htmlOverflow
      html.style.overscrollBehavior = previous.htmlOverscrollBehavior
      body.style.position = previous.bodyPosition
      body.style.top = previous.bodyTop
      body.style.left = previous.bodyLeft
      body.style.right = previous.bodyRight
      body.style.width = previous.bodyWidth
      body.style.overflow = previous.bodyOverflow
      body.style.overscrollBehavior = previous.bodyOverscrollBehavior
      window.scrollTo(scrollX, scrollY)
    }
  }, [openFuturePlanType])

  function focusFuturePlanWithoutMovingPage(event) {
    const textarea = futurePlanTextareaRef.current
    if (!textarea || document.activeElement === textarea) return

    setFuturePlanInputActive(true)

    // 阻止 iPhone 先执行原生“把输入框滚进可视区”的默认动作。
    event.preventDefault()
    event.stopPropagation()

    const phoneShell = textarea.closest('.phoneShell')
    const fullPage = textarea.closest('.footprintFullPage')
    const shellScrollTop = phoneShell?.scrollTop || 0
    const pageScrollTop = fullPage?.scrollTop || 0
    const windowScrollX = window.scrollX || 0
    const windowScrollY = window.scrollY || 0

    try {
      textarea.focus({ preventScroll: true })
    } catch {
      textarea.focus()
    }

    const restorePosition = () => {
      if (phoneShell) phoneShell.scrollTop = shellScrollTop
      if (fullPage) fullPage.scrollTop = pageScrollTop
      window.scrollTo(windowScrollX, windowScrollY)
    }

    // iOS 会在键盘动画开始后再次尝试调整视口，因此分三次恢复原位。
    restorePosition()
    window.requestAnimationFrame(restorePosition)
    window.setTimeout(restorePosition, 80)

    const end = textarea.value.length
    textarea.setSelectionRange?.(end, end)
  }

  function currentFuturePlan(type = footprintView) {
    const saved = data?.futureFootprintPlans?.[type] || {}
    return {
      text: typeof saved.text === 'string' ? saved.text : '',
      x: Number.isFinite(Number(saved.x)) ? Number(saved.x) : 88,
      y: Number.isFinite(Number(saved.y)) ? Number(saved.y) : 84,
    }
  }

  function updateFuturePlan(type, patch) {
    setData(prev => {
      const existingPlans = prev.futureFootprintPlans || {}
      const existingPlan = existingPlans[type] || {}
      return {
        ...prev,
        futureFootprintPlans: {
          ...existingPlans,
          [type]: {
            ...existingPlan,
            ...patch,
          },
        },
        lastSavedAt: Date.now(),
      }
    })
  }

  function beginFuturePlanDrag(event) {
    if (yearsMode !== 'browseFull') return
    const layer = futurePlanLayerRef.current
    const luggage = event.currentTarget.closest('.futureFootprintLuggage')
    if (!layer || !luggage) return

    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture?.(event.pointerId)

    const layerRect = layer.getBoundingClientRect()
    const luggageRect = luggage.getBoundingClientRect()
    futurePlanDragRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startLeft: luggageRect.left - layerRect.left + luggageRect.width / 2,
      startTop: luggageRect.top - layerRect.top + luggageRect.height / 2,
      halfWidth: luggageRect.width / 2,
      halfHeight: luggageRect.height / 2,
      layerWidth: layerRect.width,
      layerHeight: layerRect.height,
      luggage,
      moved: false,
      nextX: null,
      nextY: null,
    }
  }

  function moveFuturePlanDrag(event) {
    const drag = futurePlanDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return

    event.preventDefault()
    event.stopPropagation()

    const dx = event.clientX - drag.startClientX
    const dy = event.clientY - drag.startClientY
    if (!drag.moved && Math.hypot(dx, dy) < 8) return
    drag.moved = true

    const leftPx = Math.min(
      drag.layerWidth - drag.halfWidth,
      Math.max(drag.halfWidth, drag.startLeft + dx),
    )
    const topPx = Math.min(
      drag.layerHeight - drag.halfHeight,
      Math.max(drag.halfHeight, drag.startTop + dy),
    )

    drag.nextX = Number(((leftPx / drag.layerWidth) * 100).toFixed(2))
    drag.nextY = Number(((topPx / drag.layerHeight) * 100).toFixed(2))
    drag.luggage.style.left = `${drag.nextX}%`
    drag.luggage.style.top = `${drag.nextY}%`
  }

  function endFuturePlanDrag(event) {
    const drag = futurePlanDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    if (drag.moved && Number.isFinite(drag.nextX) && Number.isFinite(drag.nextY)) {
      updateFuturePlan(footprintView, { x: drag.nextX, y: drag.nextY })
    }
    futurePlanDragRef.current = null
    event.currentTarget.releasePointerCapture?.(event.pointerId)
  }

  function handleSaveFootprint() {
    const year = Number(footprintDraft?.year)
    const month = Number(footprintDraft?.month)
    const now = new Date()
    const currentYearNumber = now.getFullYear()
    const currentMonthNumber = now.getMonth() + 1

    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
      setFootprintModal({
        title: '年月不正确',
        text: '请输入有效的年份和1到12之间的月份。',
      })
      return
    }

    if (year > currentYearNumber || (year === currentYearNumber && month > currentMonthNumber)) {
      setFootprintModal({
        title: '这是未来的日期',
        text: '足迹只记录已经发生的经历。未来计划请点击页面上的行李箱纸条记录。',
      })
      return
    }

    saveFootprint()
  }

  const footprintTypeLabel = type => FOOTPRINT_TYPES[type] || type || '足迹'

  const formatFootprintMonth = month => {
    const value = Number(month)
    if (!Number.isInteger(value) || value < 1 || value > 12) {
      return month || '待记录'
    }
    return String(value).padStart(2, '0')
  }

  const footprintPhotoThumbnail = photo => {
    if (typeof photo === 'string') return photo
    return String(photo?.thumbnail || '')
  }


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
    setFootprintPopupMaximized(false)
    setSelectedFootprintId(visits[0]?.id || group.item.id)
  }

  function closeFootprintPopup() {
    setPopupVisitIndex(0)
    setFootprintPopupMaximized(false)
    setSelectedFootprintId(null)
  }

  function showPreviousVisit() {
    setPopupVisitIndex(index => Math.max(0, index - 1))
  }

  function showNextVisit() {
    setPopupVisitIndex(index => Math.min(selectedMarkerVisits.length - 1, index + 1))
  }

  function toggleBrowseSort(field) {
    setBrowseSort(current => ({
      field,
      direction: current.field === field
        ? (current.direction === 'asc' ? 'desc' : 'asc')
        : (field === 'date' ? 'desc' : 'asc'),
    }))
  }

  function browseSortArrow(field) {
    if (browseSort.field !== field) return ''
    return browseSort.direction === 'asc' ? '▲' : '▼'
  }

  const browseFootprints = useMemo(() => {
    const items = (footprints || []).filter(item => item.type === footprintView)

    return [...items].sort((a, b) => {
      let result = 0

      if (browseSort.field === 'place') {
        result = String(a.place || '').localeCompare(
          String(b.place || ''),
          'zh-CN',
          { numeric: true, sensitivity: 'base' },
        )
      } else {
        const aDate = Number(a.year || 0) * 12 + Number(a.month || 0)
        const bDate = Number(b.year || 0) * 12 + Number(b.month || 0)
        result = aDate - bDate
      }

      if (result === 0) {
        result = String(a.id || '').localeCompare(String(b.id || ''))
      }

      return browseSort.direction === 'asc' ? result : -result
    })
  }, [footprints, footprintView, browseSort])

  return (
    <>
      <div className="yearsOverlay">
        {yearsMode === 'addMap' || yearsMode === 'browseFull' || yearsMode === 'setHome' ? (
          <div className={`footprintFullPage ${yearsMode === 'addMap' ? 'footprintAddMode' : yearsMode === 'setHome' ? 'footprintHomeMode' : 'footprintBrowseMode'}`}>
            <div className="footprintFullTop footprintTopBar">
              {(yearsMode === 'browseFull' || yearsMode === 'setHome') && (
                <button type="button" className="footprintBackText" onClick={() => setYearsMode('home')} aria-label="返回足迹">‹</button>
              )}
              <div className="footprintTabsShell">
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

              <button
                type="button"
                className="footprintInfoButton"
                onClick={() => setShowFootprintInfo(true)}
              >
                说明
              </button>
            </div>
      
            <div className="footprintMapLayout" ref={futurePlanLayerRef}>
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
                    <div className={`mapFootprintPopup ${footprintPopupMaximized ? 'isMaximized' : ''}`}>
                      <button
                        type="button"
                        className="mapFootprintPopupClose"
                        onClick={closeFootprintPopup}
                        aria-label="关闭足迹详情"
                      >
                        ×
                      </button>

                      <button
                        type="button"
                        className="mapFootprintPopupResize"
                        onClick={() => setFootprintPopupMaximized(value => !value)}
                        aria-label={footprintPopupMaximized ? '恢复足迹详情窗口' : '最大化足迹详情窗口'}
                        title={footprintPopupMaximized ? '恢复窗口' : '最大化窗口'}
                      >
                        {footprintPopupMaximized ? '❐' : '▢'}
                      </button>

                      <div className="mapFootprintPopupHeader">
                        <strong><span>{popupFootprint.year || '待记录'}年{formatFootprintMonth(popupFootprint.month)}月 · {popupFootprint.place || '待记录'}</span></strong>

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
                          {popupFootprint.photos.map((photo, index) => {
                            const thumbnail = footprintPhotoThumbnail(photo)
                            if (!thumbnail) return null

                            return (
                              <button
                                type="button"
                                className="mapFootprintPhotoButton"
                                key={photo?.id || index}
                                onClick={() => openFootprintPhoto(photo, popupFootprint.photos, index)}
                                aria-label={`打开足迹原图${index + 1}`}
                              >
                                <img src={thumbnail} alt={`足迹照片${index + 1}`} />
                              </button>
                            )
                          })}
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
                    <span>出行年月</span>
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
                    <span className="footprintUploadLabel">上传图片</span>
                    <button
                      type="button"
                      className="footprintPhotoIndexButton"
                      onClick={() => handleFootprintPhotos()}
                      aria-label="从照片图库选择图片"
                    >
                      <img
                      className="footprintPhotoIndexIcon"
                      src="/refine/footprint_photoicon.png"
                      alt=""
                      aria-hidden="true"
                    />
                    </button>
                    <span className="footprintPhotoIndexNote">仅保存原图索引，不占空间。</span>
                    <input
                      className="footprintPhotoNativeInput footprintPhotoFallbackInput"
                      type="file"
                      accept="image/*"
                      multiple
                      aria-label="上传足迹图片"
                      onChange={e => {
                        handleFootprintPhotos(e.target.files)
                        e.target.value = ''
                      }}
                    />
                  </div>
                  {(footprintDraft.photos || []).length > 0 && (
                    <div className="footprintPhotoPreviewGrid">
                      {(footprintDraft.photos || []).map((photo, index) => {
                        const thumbnail = footprintPhotoThumbnail(photo)
                        if (!thumbnail) return null

                        return (
                          <div className="footprintPhotoPreview" key={photo?.id || index}>
                            <button
                              type="button"
                              className="footprintPhotoPreviewOpen"
                              onClick={() => openFootprintPhoto(photo, footprintDraft.photos, index)}
                              aria-label={`打开足迹原图${index + 1}`}
                            >
                              <img src={thumbnail} alt={`足迹照片${index + 1}`} />
                            </button>
                            <button
                              type="button"
                              className="footprintPhotoDeleteButton"
                              onPointerDown={event => {
                                event.preventDefault()
                                event.stopPropagation()
                              }}
                              onTouchStart={event => {
                                event.stopPropagation()
                              }}
                              onClick={event => {
                                event.preventDefault()
                                event.stopPropagation()
                                removeFootprintPhoto(index)
                              }}
                              aria-label={`删除足迹照片${index + 1}`}
                              title="删除照片"
                            >
                              <span aria-hidden="true">×</span>
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                  <div className="footprintSaveActions">
                    <button className="saveFootprintBtn" disabled={!placeInputValid || !footprintDraft.place || !footprintDraft.year || !footprintDraft.month} onClick={handleSaveFootprint}>保存</button>
                    <button type="button" className="saveFootprintBtn footprintCancelBtn" onClick={cancelFootprintEdit}>放弃</button>
                  </div>
                </div>
              ) : (
                <div className="yearsCard footprintEditorCard footprintBrowseListCard">
                  <p className="footprintTip">点图钉或记录看详情；拖行李箱、点纸条写计划。</p>
                  <div className="footprintFullList compactFootprintList">
                    {browseFootprints.length === 0 && <p>这里还没有足迹。</p>}
                    {browseFootprints.map(item => {
                      const thumb = Array.isArray(item.photos) && item.photos.length > 0 ? footprintPhotoThumbnail(item.photos[0]) : ''
                      const active = selectedFootprintId === item.id

                      return (
                        <div
                          className={active ? 'footprintListButton active footprintListRecord' : 'footprintListButton footprintListRecord'}
                          key={item.id}
                          role="button"
                          tabIndex={0}
                          aria-pressed={active}
                          onClick={() => {
                            setPopupVisitIndex(0)
                            setSelectedFootprintId(item.id)
                          }}
                          onKeyDown={event => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault()
                              setPopupVisitIndex(0)
                              setSelectedFootprintId(item.id)
                            }
                          }}
                        >
                          <span className="footprintListThumb">{thumb ? <img src={thumb} alt="" /> : <span>图</span>}</span>
                          <span className="footprintListText">
                            <strong>
                              <span
                                className={`footprintSortCell footprintSortDate ${browseSort.field === 'date' ? 'sorting' : ''}`}
                                role="button"
                                tabIndex={0}
                                title="按日期排序"
                                onClick={event => {
                                  event.stopPropagation()
                                  toggleBrowseSort('date')
                                }}
                                onKeyDown={event => {
                                  if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault()
                                    event.stopPropagation()
                                    toggleBrowseSort('date')
                                  }
                                }}
                              >
                                {item.year}年{formatFootprintMonth(item.month)}月
                                <small className="footprintSortArrow" aria-hidden="true">{browseSortArrow('date')}</small>
                              </span>
                              <span className="footprintListSeparator"> · </span>
                              <span
                                className={`footprintSortCell footprintSortPlace ${browseSort.field === 'place' ? 'sorting' : ''}`}
                                role="button"
                                tabIndex={0}
                                title="按地名排序"
                                onClick={event => {
                                  event.stopPropagation()
                                  toggleBrowseSort('place')
                                }}
                                onKeyDown={event => {
                                  if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault()
                                    event.stopPropagation()
                                    toggleBrowseSort('place')
                                  }
                                }}
                              >
                                {item.place}
                                <small className="footprintSortArrow" aria-hidden="true">{browseSortArrow('place')}</small>
                              </span>
                            </strong>
                            {item.detail ? <small>{item.detail}</small> : null}
                          </span>
                        </div>
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

              {yearsMode === 'browseFull' && (() => {
                const plan = currentFuturePlan(footprintView)
                return (
                  <div
                    className={`futureFootprintLuggage futureFootprintLuggage-${footprintView}`}
                    style={{ left: `${plan.x}%`, top: `${plan.y}%` }}
                    onClick={event => event.stopPropagation()}
                    aria-label={`${FOOTPRINT_TYPES[footprintView] || '足迹'}行程计划`}
                  >
                    <img
                      className="futureFootprintLuggageImage"
                      src={futurePlanImages[footprintView] || futurePlanImages.local}
                      alt="行李箱"
                      draggable="false"
                    />
                    <span
                      className="futureFootprintLuggageHandle"
                      role="button"
                      tabIndex={0}
                      aria-label="按住拉杆拖动行李箱"
                      onPointerDown={beginFuturePlanDrag}
                      onPointerMove={moveFuturePlanDrag}
                      onPointerUp={endFuturePlanDrag}
                      onPointerCancel={endFuturePlanDrag}
                      onClick={event => event.preventDefault()}
                    />
                    <button
                      type="button"
                      className="futureFootprintNoteButton"
                      onPointerDown={event => event.stopPropagation()}
                      onClick={event => {
                        event.stopPropagation()
                        setOpenFuturePlanType(footprintView)
                      }}
                      aria-label="打开行程计划便签"
                    >
                      <span aria-hidden="true">🗒</span>
                    </button>
                  </div>
                )
              })()}
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
                    <strong>{footprintRangeParts.first.y}</strong>年<strong>{footprintRangeParts.first.m}</strong>月 ~ <strong>{footprintRangeParts.last.y}</strong>年<strong>{footprintRangeParts.last.m}</strong>月，去过
                  </>
                ) : (
                  <>尚未开始记录，你去过</>
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
                                const thumb = Array.isArray(item.photos) && item.photos.length > 0
                                  ? footprintPhotoThumbnail(item.photos[0])
                                  : ''
                                return (
                                  <button type="button" className="footprintHomeRecord" key={item.id} onClick={() => openFootprintRecord(item)}>
                                    <span className="footprintHomeThumb">{thumb ? <img src={thumb} alt="" /> : <span>图</span>}</span>
                                    <span className="footprintHomeDate">{item.year || '待'}年{formatFootprintMonth(item.month)}月</span>
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

      {showFootprintInfo && (
        <section className="footprintInfoPage" aria-label="足迹说明">
          <header className="footprintInfoHeader">
            <button
              type="button"
              className="footprintInfoBack"
              onClick={() => setShowFootprintInfo(false)}
              aria-label="返回足迹"
            >
              ‹
            </button>
            <h2>足迹说明</h2>
          </header>

          <div className="footprintInfoBody">
            <p>
              新增足迹时，可以先选择固定区域，再直接点击地图，把图钉放到更准确的位置。
              已经保存的记录，可以点击地图上的图钉，或点击下方记录查看详情。
            </p>

            <p>
              记录列表中的日期和地名可以点击排序。图钉和详情框尽量放在地图空白处，
              方便同时看清地点、路线和记录内容。
            </p>

            <p>
              行李箱用于记录未来计划。点击行李箱上的纸条可以写计划，
              拖动行李箱拉杆，可以把它移动到地图上的任意位置。
            </p>

            <p>
              照片只保存原图索引和缩略图，不会在雪球里复制一份原图。
              点击缩略图可以回到相册查看原图，并可左右滑动浏览同一条记录中的照片。
            </p>

            <p>
              查看原图时，可以放大照片；长按照片可以打开手机的分享页面，
              转发到微信、短信或其它支持的应用。原图如果从相册删除，索引也会失效。
            </p>
          </div>
        </section>
      )}

      {openFuturePlanType && (() => {
        const plan = currentFuturePlan(openFuturePlanType)
        return (
          <div
            className="futureFootprintNoteOverlay"
            onClick={() => setOpenFuturePlanType(null)}
            onTouchMove={event => {
              if (!event.target.closest('.futureFootprintNotePaper textarea')) event.preventDefault()
            }}
          >
            <section
              className="futureFootprintNotePaper"
              role="dialog"
              aria-modal="true"
              aria-label="行程计划"
              onClick={event => event.stopPropagation()}
              onPointerDown={event => event.stopPropagation()}
              onTouchMove={event => event.stopPropagation()}
            >
              <button
                type="button"
                className="futureFootprintNoteClose"
                onClick={() => setOpenFuturePlanType(null)}
                aria-label="关闭行程计划"
              >×</button>
              <h2>行程计划</h2>
              <textarea
                ref={futurePlanTextareaRef}
                className={futurePlanInputActive ? 'isInputActive' : ''}
                value={plan.text}
                onChange={event => updateFuturePlan(openFuturePlanType, { text: event.target.value })}
                onPointerDown={focusFuturePlanWithoutMovingPage}
                onBlur={() => setFuturePlanInputActive(false)}
                placeholder="在这里写出行计划...拖行李箱拉杆，可移至任何位置。"
                aria-label="未来足迹计划内容"
              />
            </section>
          </div>
        )
      })()}

      {footprintModal && (
        <div className="footprintNoticeOverlay" onClick={() => setFootprintModal(null)}>
          <div className="footprintNoticeBox" onClick={e => e.stopPropagation()}>
            <button type="button" className="footprintNoticeClose" onClick={() => setFootprintModal(null)} aria-label="关闭提示">×</button>
            <h2>{footprintModal.title}</h2>
            <p>{footprintModal.text}</p>
          </div>
        </div>
      )}
    </>
  )
}
