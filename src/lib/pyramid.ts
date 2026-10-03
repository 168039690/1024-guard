import { sideSign } from './position';
import type { Direction } from './types';

export interface PyramidInput {
  direction: Direction;
  openQty: number;
  avgEntry: number;
  baseQty: number;
  /** 这笔交易到目前为止已实现的净盈亏（含已付手续费）。 */
  realizedNet: number;
  currentStop: number;
  addPrice: number;
  newStop: number;
  takerFee: number;
  slippage: number;
}

export interface PyramidResult {
  error: string | null;
  lockedProfit: number;
  perUnitLoss: number;
  maxByRisk: number;
  maxByBase: number;
  qty: number;
  newAvg: number;
  pnlAtStop: number;
}

/** 加仓后整笔交易打到新止损时仍不亏本金，能加的最大数量。 */
export function calcPyramid(i: PyramidInput): PyramidResult {
  const s = sideSign(i.direction);
  const blank: PyramidResult = {
    error: null,
    lockedProfit: 0,
    perUnitLoss: 0,
    maxByRisk: 0,
    maxByBase: i.baseQty,
    qty: 0,
    newAvg: i.avgEntry,
    pnlAtStop: 0,
  };

  if (!(i.addPrice > 0) || !(i.newStop > 0)) return { ...blank, error: '填写加仓价和新止损' };
  if (s * (i.currentStop - i.avgEntry) < 0) return { ...blank, error: '原仓位的止损还没推到保本，不能加仓' };
  if (s * (i.addPrice - i.newStop) <= 0) {
    return { ...blank, error: i.direction === 'long' ? '新止损必须低于加仓价' : '新止损必须高于加仓价' };
  }
  if (s * (i.newStop - i.currentStop) < 0) {
    return { ...blank, error: '止损只能朝有利方向移动，新止损不能比当前止损更差' };
  }

  const lockedProfit = i.realizedNet + i.openQty * (s * (i.newStop - i.avgEntry) - i.newStop * i.takerFee);
  const perUnitLoss =
    s * (i.addPrice - i.newStop) + (i.addPrice + i.newStop) * i.takerFee + i.addPrice * i.slippage;
  const maxByRisk = lockedProfit > 0 ? lockedProfit / perUnitLoss : 0;
  const qty = Math.max(0, Math.min(maxByRisk, i.baseQty));
  const newAvg = (i.openQty * i.avgEntry + qty * i.addPrice) / (i.openQty + qty);

  return {
    error: qty > 0 ? null : '已锁定的利润不够承担加仓风险，这次不加',
    lockedProfit,
    perUnitLoss,
    maxByRisk,
    maxByBase: i.baseQty,
    qty,
    newAvg,
    pnlAtStop: lockedProfit - qty * perUnitLoss,
  };
}
