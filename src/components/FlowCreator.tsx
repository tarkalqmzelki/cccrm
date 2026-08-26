import { useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Play, Flag, Filter, Gift, Trash2, Plus, Workflow,
} from 'lucide-react'
import type { FlowNode, FlowMetric, RuleFlow, FlowNodeKind } from '../lib/types'
import { FLOW_METRIC_LABEL } from '../lib/types'
import { Input, Field } from './ui/Input'
import { Button } from './ui/Button'
import { SegmentedControl } from './ui/SegmentedControl'

/**
 * Visual rule-flow creator (n8n-style, mini): a dotted canvas with
 * draggable node cards chained left→right — Start → Goal(s) →
 * optional Conditions ("of which at least N …") → Reward. The chain
 * order is the evaluation order; edges are drawn as bezier connectors.
 */

const NODE_W = 158
const NODE_H = 84

const KIND_STYLE: Record<FlowNodeKind, { icon: React.ReactNode; label: string; color: string }> = {
  start:     { icon: <Play size={13} strokeWidth={2.25} />,     label: 'Challenge starts', color: '#71717a' },
  goal:      { icon: <Flag size={13} strokeWidth={2.25} />,      label: 'Goal',             color: '#3b82f6' },
  condition: { icon: <Filter size={13} strokeWidth={2.25} />,    label: 'Condition',        color: '#f59e0b' },
  reward:    { icon: <Gift size={13} strokeWidth={2.25} />,      label: 'Reward',           color: '#22c55e' },
}

let seq = 0
const uid = () => `n${Date.now().toString(36)}${(seq++).toString(36)}`

function defaultNode(kind: FlowNodeKind, x: number, y: number): FlowNode {
  const base: FlowNode = { id: uid(), kind, x, y }
  if (kind === 'goal') { base.metric = 'lead_created'; base.count = 10 }
  if (kind === 'condition') { base.metric = 'deal_submitted'; base.min = 1 }
  if (kind === 'reward') { base.points = 100; base.bonus = 50 }
  return base
}

export function FlowCreator({ value, onChange }: { value: RuleFlow | null; onChange: (f: RuleFlow) => void }) {
  const flow = value ?? emptyFlow()
  const [selected, setSelected] = useState<string | null>(null)
  const dragRef = useRef<{ id: string; startX: number; startY: number; ox: number; oy: number } | null>(null)

  const byId = new Map(flow.nodes.map((n) => [n.id, n]))
  const ordered = flow.order.map((id) => byId.get(id)).filter(Boolean) as FlowNode[]
  const hasReward = ordered.some((n) => n.kind === 'reward')

  function emit(nextOrder: string[], nextNodes: FlowNode[]) {
    onChange({ order: nextOrder, nodes: nextNodes })
  }

  function addNode(kind: FlowNodeKind) {
    if (kind === 'start') return
    if (kind === 'reward' && hasReward) return
    const idx = flow.order.length
    const node = defaultNode(kind, 20 + Math.min(idx, 4) * 172, 28 + (idx > 3 ? 120 : 0))
    let order = [...flow.order]
    // Reward goes last; goal/condition slot in before an existing reward.
    if (kind === 'reward') order.push(node.id)
    else {
      const rewardId = order.find((id) => byId.get(id)?.kind === 'reward')
      if (rewardId) order.splice(order.indexOf(rewardId), 0, node.id)
      else order.push(node.id)
    }
    emit(order, [...flow.nodes, node])
    setSelected(node.id)
  }

  function removeNode(id: string) {
    const n = byId.get(id)
    if (!n || n.kind === 'start' || n.kind === 'reward') return
    emit(flow.order.filter((x) => x !== id), flow.nodes.filter((x) => x.id !== id))
    if (selected === id) setSelected(null)
  }

  function updateNode(id: string, patch: Partial<FlowNode>) {
    emit(flow.order, flow.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)))
  }

  /* pointer drag (mouse + touch) — writes x/y into state */
  function startDrag(e: React.PointerEvent, node: FlowNode) {
    if ((e.target as HTMLElement).closest('[data-no-drag]')) return
    e.preventDefault()
    dragRef.current = { id: node.id, startX: e.clientX, startY: e.clientY, ox: node.x, oy: node.y }
    const move = (ev: PointerEvent) => {
      const d = dragRef.current
      if (!d) return
      const nx = Math.max(4, Math.min(d.ox + ev.clientX - d.startX, 1600))
      const ny = Math.max(4, Math.min(d.oy + ev.clientY - d.startY, 600))
      updateNode(d.id, { x: nx, y: ny })
    }
    const up = () => {
      dragRef.current = null
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    setSelected(node.id)
  }

  function nodePos(id: string): { x: number; y: number } {
    const n = byId.get(id)
    return { x: n?.x ?? 20, y: n?.y ?? 20 }
  }

  const sel = selected ? byId.get(selected) : undefined

  return (
    <div>
      {/* Toolbar */}
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 inline-flex items-center gap-1 text-2xs font-bold uppercase tracking-wider text-ink-400">
          <Workflow size={12} strokeWidth={2} /> Rule flow
        </span>
        <Button type="button" variant="subtle" size="sm" icon={<Plus size={13} strokeWidth={2} />} onClick={() => addNode('goal')}>Goal</Button>
        <Button type="button" variant="subtle" size="sm" icon={<Plus size={13} strokeWidth={2} />} onClick={() => addNode('condition')}>Condition</Button>
        {!hasReward && (
          <Button type="button" variant="subtle" size="sm" icon={<Plus size={13} strokeWidth={2} />} onClick={() => addNode('reward')}>Reward</Button>
        )}
        <span className="ml-auto hidden text-2xs text-ink-300 sm:inline">Drag nodes · tap to edit</span>
      </div>

      {/* Canvas */}
      <div
        className="relative h-72 overflow-auto rounded-xl border border-line"
        style={{
          backgroundColor: 'rgb(var(--canvas))',
          backgroundImage: 'radial-gradient(rgb(var(--ink-200)) 1px, transparent 1px)',
          backgroundSize: '18px 18px',
        }}
      >
        <div className="relative" style={{ width: 1640, height: 620 }}>
          {/* Edges */}
          <svg className="pointer-events-none absolute inset-0 h-full w-full">
            {flow.order.slice(0, -1).map((id, i) => {
              const a = nodePos(id)
              const b = nodePos(flow.order[i + 1])
              const x1 = a.x + NODE_W, y1 = a.y + NODE_H / 2
              const x2 = b.x, y2 = b.y + NODE_H / 2
              const d = `M ${x1} ${y1} C ${x1 + 42} ${y1}, ${x2 - 42} ${y2}, ${x2} ${y2}`
              return (
                <g key={`${id}-${flow.order[i + 1]}`}>
                  <path d={d} fill="none" stroke="rgb(var(--ink-300))" strokeWidth="2" />
                  <circle cx={x2} cy={y2} r="3.5" fill="rgb(var(--ink-400))" />
                </g>
              )
            })}
          </svg>

          {/* Nodes */}
          {ordered.map((n) => {
            const st = KIND_STYLE[n.kind]
            const isSel = selected === n.id
            return (
              <div
                key={n.id}
                onPointerDown={(e) => startDrag(e, n)}
                onClick={() => setSelected(n.id)}
                className={`absolute cursor-grab touch-none select-none rounded-xl border bg-surface shadow-md transition-shadow active:cursor-grabbing ${isSel ? 'ring-2 ring-info/60 shadow-lg' : 'hover:shadow-lg'}`}
                style={{ left: n.x, top: n.y, width: NODE_W, borderColor: isSel ? undefined : `${st.color}66` }}
              >
                <div
                  className="flex items-center gap-1.5 rounded-t-xl px-2.5 py-1.5 text-white"
                  style={{ background: `linear-gradient(120deg, ${st.color}, ${st.color}bb)` }}
                >
                  {st.icon}
                  <span className="text-[10px] font-bold uppercase tracking-wide">{st.label}</span>
                  {n.kind !== 'start' && n.kind !== 'reward' && (
                    <button
                      data-no-drag
                      onClick={(e) => { e.stopPropagation(); removeNode(n.id) }}
                      className="ml-auto rounded p-0.5 text-white/70 hover:bg-white/20 hover:text-white"
                      title="Remove node"
                    >
                      <Trash2 size={11} strokeWidth={2.25} />
                    </button>
                  )}
                </div>
                <div className="px-2.5 py-1.5 text-2xs leading-snug text-ink-600 dark:text-ink-200">
                  {n.kind === 'start' && <>Member starts from zero</>}
                  {n.kind === 'goal' && <><span className="num font-bold">{n.count}</span> {FLOW_METRIC_LABEL[n.metric ?? 'lead_created'].toLowerCase()}</>}
                  {n.kind === 'condition' && <>incl. ≥<span className="num font-bold">{n.min}</span> {FLOW_METRIC_LABEL[n.metric ?? 'deal_submitted'].toLowerCase()}</>}
                  {n.kind === 'reward' && <>+<span className="num font-bold">{n.points}</span> pts{n.bonus ? <> · <span className="num font-bold">{n.bonus}€</span></> : null}</>}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Inspector */}
      {sel && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-3 rounded-xl border border-line p-3"
        >
          <div className="mb-2 flex items-center gap-2">
            {KIND_STYLE[sel.kind].icon}
            <p className="text-xs font-bold uppercase tracking-wide" style={{ color: KIND_STYLE[sel.kind].color }}>
              {KIND_STYLE[sel.kind].label}
            </p>
          </div>
          {(sel.kind === 'goal' || sel.kind === 'condition') && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Metric">
                <SegmentedControl
                  value={sel.metric ?? 'lead_created'}
                  onChange={(v) => updateNode(sel.id, { metric: v as FlowMetric })}
                  options={[
                    { value: 'lead_created', label: 'Leads' },
                    { value: 'deal_submitted', label: 'Deals' },
                  ]}
                  columns={2}
                  size="sm"
                />
              </Field>
              <Field label={sel.kind === 'goal' ? 'Required count' : 'Minimum'}>
                <Input
                  type="number"
                  min={1}
                  className="num"
                  value={sel.kind === 'goal' ? sel.count ?? 1 : sel.min ?? 1}
                  onChange={(e) => updateNode(sel.id, sel.kind === 'goal' ? { count: Math.max(1, Number(e.target.value)) } : { min: Math.max(1, Number(e.target.value)) })}
                />
              </Field>
            </div>
          )}
          {sel.kind === 'reward' && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Points" hint="Shown on the card">
                <Input type="number" min={0} className="num" value={sel.points ?? 0} onChange={(e) => updateNode(sel.id, { points: Math.max(0, Number(e.target.value)) })} />
              </Field>
              <Field label="Bonus €" hint="0 hides the cash reward">
                <Input type="number" min={0} step="0.01" className="num" value={sel.bonus ?? 0} onChange={(e) => updateNode(sel.id, { bonus: Math.max(0, Number(e.target.value)) })} />
              </Field>
            </div>
          )}
          {sel.kind === 'start' && (
            <p className="text-2xs text-ink-400">Counters start from the moment the challenge is pushed.</p>
          )}
        </motion.div>
      )}
    </div>
  )
}

export function emptyFlow(): RuleFlow {
  const start = defaultNode('start', 20, 24)
  const goal = defaultNode('goal', 250, 24)
  const reward = defaultNode('reward', 480, 24)
  return { order: [start.id, goal.id, reward.id], nodes: [start, goal, reward] }
}

/** Validates a flow before save. Returns an error message or null. */
export function validateFlow(flow: RuleFlow | null | undefined): string | null {
  if (!flow) return 'Build the rule flow first.'
  const byId = new Map(flow.nodes.map((n) => [n.id, n]))
  const ordered = flow.order.map((id) => byId.get(id)).filter(Boolean) as FlowNode[]
  if (!ordered.some((n) => n.kind === 'goal')) return 'Add at least one Goal node.'
  if (!ordered.some((n) => n.kind === 'reward')) return 'Add a Reward node.'
  return null
}
