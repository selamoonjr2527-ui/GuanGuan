import React, { useState } from 'react';
import {
  Award, Check, ChevronDown, Clock3, LayoutGrid, Menu, Receipt,
  RotateCcw, Settings, Share2, ShieldCheck, TrendingUp, Users,
  Wrench, X,
} from 'lucide-react';
import type { SessionConfig, TabType } from '../types';

interface HeaderProps {
  currentTab: TabType;
  onSelectTab: (tab: TabType) => void;
  sessionConfig: SessionConfig;
  totalPlayers: number;
  checkedInCount: number;
  activeMatchesCount: number;
  waitingCount: number;
  isOrganizerMode: boolean;
  onToggleOrganizerMode: () => void;
  onOpenSettings: () => void;
  onResetSession: () => void;
  onShareMemberLink?: () => void;
  copiedShareLink?: boolean;
}

const tabs = [
  { id: 'prematch', label: 'คิวรอเล่น', icon: Clock3, organizerOnly: false },
  { id: 'checkin', label: 'สมาชิก', icon: Users, organizerOnly: false },
  { id: 'courts', label: 'จัดคอร์ท', icon: LayoutGrid, organizerOnly: true },
  { id: 'assessment', label: 'ประเมินมือ', icon: Award, organizerOnly: true },
  { id: 'billing', label: 'คิดเงิน', icon: Receipt, organizerOnly: false },
  { id: 'finance', label: 'สรุปเงิน', icon: TrendingUp, organizerOnly: true },
  { id: 'tools', label: 'Tools', icon: Wrench, organizerOnly: true },
] as const;

export const Header: React.FC<HeaderProps> = ({
  currentTab, onSelectTab, sessionConfig, totalPlayers, checkedInCount,
  activeMatchesCount, waitingCount, isOrganizerMode, onOpenSettings,
  onResetSession, onShareMemberLink, copiedShareLink = false,
}) => {
  const [moreOpen, setMoreOpen] = useState(false);
  const allowedTabs = tabs.filter(t => !t.organizerOnly || isOrganizerMode);
  const primaryIds = isOrganizerMode ? ['prematch', 'checkin', 'courts', 'billing'] : ['prematch', 'checkin', 'billing'];
  const moreTabs = allowedTabs.filter(t => !primaryIds.includes(t.id));
  const navigate = (tab: TabType) => { setMoreOpen(false); onSelectTab(tab); };
  const mobileMoreSelected = moreTabs.some(t => t.id === currentTab);

  return (
    <header className="gg-header">
      <div className="gg-header__top">
        <div className="gg-header__brand" aria-label="GuanGuan CourtOS">
          <div className="gg-header__monogram" aria-hidden="true">GG</div>
          <div className="gg-header__brand-copy">
            <strong>GUAN<span>GUAN</span></strong>
            <small>COURT OS</small>
          </div>
        </div>
        <div className="gg-header__actions">
          <span className="gg-header__live"><span className="gg-dot"/> LIVE</span>
          {isOrganizerMode && <span className="gg-header__role"><ShieldCheck size={14}/> ORGANIZER</span>}
          {onShareMemberLink && <button type="button" className="gg-header__icon-button" onClick={onShareMemberLink} title={copiedShareLink ? 'คัดลอกลิงก์แล้ว' : 'แชร์ลิงก์ให้สมาชิก'} aria-label={copiedShareLink ? 'คัดลอกลิงก์แล้ว' : 'แชร์ลิงก์ให้สมาชิก'}>{copiedShareLink ? <Check size={18}/> : <Share2 size={18}/>}</button>}
          {isOrganizerMode && <>
            <button type="button" className="gg-header__icon-button" onClick={onOpenSettings} aria-label="ตั้งค่าก๊วน" title="ตั้งค่าก๊วน"><Settings size={18}/></button>
            <button type="button" className="gg-header__icon-button gg-header__icon-button--danger" onClick={onResetSession} aria-label="รีเซ็ต Session" title="รีเซ็ต Session"><RotateCcw size={18}/></button>
          </>}
        </div>
      </div>
      <div className="gg-header__context">
        <span className="gg-header__date">{sessionConfig.date}</span>
        <span className="gg-header__session-title">{sessionConfig.sessionTitle}</span>
        <span className="gg-header__context-separator"/>
        <span className="gg-header__location">{sessionConfig.venueName}</span>
        {isOrganizerMode && (
          <span className="gg-header__context-count">
            <b>{checkedInCount}</b> / {totalPlayers} สมาชิก
            <em>{waitingCount}</em> รอ
            <i>{activeMatchesCount}</i> คอร์ท
          </span>
        )}
      </div>
      <nav className="gg-header__desktop-nav" aria-label="เมนูหลัก GuanGuan">
        {allowedTabs.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" onClick={() => navigate(id)} aria-current={currentTab === id ? 'page' : undefined} className={`gg-header__nav-item ${currentTab === id ? 'is-active' : ''}`}>
            <Icon size={17} aria-hidden="true"/><span>{label}</span>
          </button>
        ))}
      </nav>
      <nav className="gg-header__mobile-nav" aria-label="เมนูหลักบนมือถือ">
        {allowedTabs.filter(t => primaryIds.includes(t.id)).map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" onClick={() => navigate(id)} className={`gg-header__mobile-item ${currentTab === id ? 'is-active' : ''}`} aria-current={currentTab === id ? 'page' : undefined}>
            <Icon size={20} aria-hidden="true"/><span>{label}</span>
          </button>
        ))}
        {moreTabs.length > 0 && <button type="button" onClick={() => setMoreOpen(v => !v)} className={`gg-header__mobile-item ${mobileMoreSelected || moreOpen ? 'is-active' : ''}`} aria-expanded={moreOpen} aria-label={moreOpen ? 'ปิดเมนูเพิ่มเติม' : 'เมนูเพิ่มเติม'}>{moreOpen ? <X size={20}/> : <Menu size={20}/>}<span>เพิ่มเติม</span></button>}
      </nav>
      {moreOpen && moreTabs.length > 0 && <div className="gg-header__more-panel" role="group" aria-label="เมนูเพิ่มเติม">
        <div className="gg-header__more-title">เมนูผู้จัด <ChevronDown size={15}/></div>
        {moreTabs.map(({ id, label, icon: Icon }) => <button type="button" key={id} onClick={() => navigate(id)} className={`gg-header__more-item ${currentTab === id ? 'is-active' : ''}`}><Icon size={18}/>{label}</button>)}
      </div>}
    </header>
  );
};
