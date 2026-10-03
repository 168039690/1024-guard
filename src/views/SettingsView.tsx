import { useEffect, useRef, useState } from 'react';
import { Card, Field, Seg } from '../components/ui';
import { DEFAULT_SETTINGS, initialState } from '../lib/defaults';
import { fmtDate, num } from '../lib/format';
import { getState, replaceState, update, useAppState } from '../lib/store';
import type { Settings } from '../lib/types';

function setSettings(patch: Partial<Settings>) {
  update((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
}

const round6 = (x: number) => Math.round(x * 1e6) / 1e6;

function SettingNum({
  label,
  value,
  scale = 1,
  min,
  max,
  strict,
  hint,
  onSave,
}: {
  label: string;
  value: number;
  scale?: number;
  min?: number;
  max?: number;
  strict?: boolean;
  hint?: string;
  onSave: (v: number) => void;
}) {
  const shown = round6(value * scale);
  const [v, setV] = useState(String(shown));
  useEffect(() => setV(String(shown)), [shown]);
  const n = num(v);
  const tail = strict ? '（手册规则只能调严）' : '';
  const error = !Number.isFinite(n)
    ? '填数字'
    : min !== undefined && n < min
      ? `不能低于 ${min}${tail}`
      : max !== undefined && n > max
        ? `不能高于 ${max}${tail}`
        : null;
  const commit = () => {
    if (error) setV(String(shown));
    else if (n !== shown) onSave(n / scale);
  };
  return (
    <Field label={label} hint={error ? <span className="red">{error}</span> : hint}>
      <input
        type="text"
        inputMode="decimal"
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
    </Field>
  );
}

export function SettingsView() {
  const st = useAppState().settings;
  const D = DEFAULT_SETTINGS;

  return (
    <div className="stack">
      <div className="cols">
        <div className="col">
          <Card title="资金与费率">
            <SettingNum
              label="起点资金（Lv0 总资金，U）"
              value={st.baseCapital}
              min={1}
              hint="等级表按这个数逐级翻倍。新一轮入金不得超过上一轮。"
              onSave={(v) => setSettings({ baseCapital: v })}
            />
            <div className="grid2">
              <SettingNum label="吃单手续费 %" value={st.takerFee} scale={100} min={0} max={1} onSave={(v) => setSettings({ takerFee: v })} />
              <SettingNum label="止损滑点预留 %" value={st.slippage} scale={100} min={0} max={2} onSave={(v) => setSettings({ slippage: v })} />
              <SettingNum label="BTC/ETH 维持保证金率 %" value={st.mmrMajor} scale={100} min={0.1} max={10} onSave={(v) => setSettings({ mmrMajor: v })} />
              <SettingNum label="山寨维持保证金率 %" value={st.mmrAlt} scale={100} min={0.1} max={10} onSave={(v) => setSettings({ mmrAlt: v })} />
              <SettingNum label="USDT 兑人民币" value={st.usdtCny} min={0.1} onSave={(v) => setSettings({ usdtCny: v })} />
            </div>
          </Card>

          <Card title="手册规则" extra="只能调严，不能调松">
            <div className="grid2">
              <SettingNum label="BTC/ETH 杠杆红线" value={st.levCapMajor} min={1} max={D.levCapMajor} strict onSave={(v) => setSettings({ levCapMajor: Math.floor(v) })} />
              <SettingNum label="山寨杠杆红线" value={st.levCapAlt} min={1} max={D.levCapAlt} strict onSave={(v) => setSettings({ levCapAlt: Math.floor(v) })} />
              <SettingNum label="强平距离 ÷ 止损距离 ≥" value={st.liqSafety} min={D.liqSafety} max={10} strict onSave={(v) => setSettings({ liqSafety: v })} />
              <SettingNum label="最低净盈亏比" value={st.minRR} min={D.minRR} max={20} strict onSave={(v) => setSettings({ minRR: v })} />
              <SettingNum label="最低 24h 成交额（USDT）" value={st.minQuoteVolume} min={D.minQuoteVolume} strict onSave={(v) => setSettings({ minQuoteVolume: v })} />
              <SettingNum label="开单前冷静（分钟）" value={st.coolMinutes} min={D.coolMinutes} max={240} strict onSave={(v) => setSettings({ coolMinutes: v })} />
            </div>
          </Card>

          <Card title="行情数据源">
            <Seg
              value={st.dataSource}
              options={[
                { value: 'auto', label: '自动' },
                { value: 'futures', label: '只用合约' },
                { value: 'spot', label: '只用现货' },
              ]}
              onChange={(dataSource) => setSettings({ dataSource })}
            />
            <p className="small muted" style={{ marginTop: 10 }}>
              自动：先连币安合约接口（需要能访问币安），连不上就用现货行情镜像 data-api.binance.vision，国内一般能直连。现货的成交额比合约低，流动性检查会更严。
            </p>
          </Card>
        </div>

        <div className="col">
          <DataCard />
          <Card title="装到桌面和手机">
            <p className="small">
              <b>iPhone</b>：用 Safari 打开守门员网址 → 分享 → 「添加到主屏幕」。
            </p>
            <p className="small">
              <b>Mac / Windows</b>：用 Chrome 或 Edge 打开 → 地址栏右侧的「安装」图标（或菜单里「将此站点作为应用安装」）。不用装 exe，也不需要管理员权限。
            </p>
            <p className="small">
              <b>iPhone 拦截币安 App</b>：快捷指令 → 自动化 → 新建个人自动化 → App → 选「币安」→ 勾「已打开」→「立即运行」→ 新建空白自动化 → 添加操作「打开 URL」，填守门员网址。以后一打开币安，会先跳到闸门。
            </p>
          </Card>
          <Card title="关于">
            <p className="small muted">
              数据只存在这台设备的浏览器里，不上传任何地方，也不需要币安 API Key。换设备用「数据」里的导出 / 导入。行情只读币安公开接口。
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}

function DataCard() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  function exportFile() {
    const blob = new Blob([JSON.stringify(getState(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `1024-guard-${fmtDate(Date.now())}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importText(raw: string) {
    try {
      const data = JSON.parse(raw);
      if (!data || typeof data !== 'object' || !('settings' in data)) throw new Error('bad');
      if (!confirm('导入会覆盖这台设备上的全部数据，继续？')) return;
      replaceState(data);
      setMsg('已导入');
      setText('');
    } catch {
      setMsg('内容不是守门员导出的数据');
    }
  }

  return (
    <Card title="数据">
      <div className="btn-row">
        <button className="btn" onClick={exportFile}>
          导出文件
        </button>
        <button
          className="btn"
          onClick={() => navigator.clipboard?.writeText(JSON.stringify(getState())).then(() => setMsg('已复制到剪贴板'))}
        >
          复制数据
        </button>
        <button className="btn" onClick={() => fileRef.current?.click()}>
          从文件导入
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) f.text().then(importText);
            e.target.value = '';
          }}
        />
      </div>
      <Field label="或者粘贴导入">
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="把另一台设备「复制数据」的内容贴在这里" />
      </Field>
      <div className="btn-row">
        <button className="btn" disabled={!text.trim()} onClick={() => importText(text)}>
          粘贴导入
        </button>
        <button
          className="btn danger"
          onClick={() => confirm('清空这台设备上的全部数据？') && replaceState(initialState())}
        >
          清空数据
        </button>
      </div>
      {msg && (
        <p className="small muted" style={{ marginTop: 10 }}>
          {msg}
        </p>
      )}
    </Card>
  );
}