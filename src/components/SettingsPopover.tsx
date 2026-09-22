import React from 'react';
import { Icon } from './Icon';

interface SettingsPopoverProps {
	showSettings: boolean;
	setShowSettings: (show: boolean) => void;
	isDark: boolean;
	toggleTheme: () => void;
	persistEnabled: boolean;
	handleTogglePersist: () => void;
	openOnStartup: boolean;
	handleToggleOpenOnStartup: () => void;
	autoPopOnError: boolean;
	handleToggleAutoPop: () => void;
	savedRecordsLimit: number;
	handleLimitChange: (limit: number) => void;
	handleClearSavedRecords: () => void;
	pingThreshold: number;
	setPingThreshold: (v: number) => void;
	sizeThreshold: number;
	setSizeThreshold: (v: number) => void;
}

export function SettingsPopover({
	showSettings,
	setShowSettings,
	isDark,
	toggleTheme,
	persistEnabled,
	handleTogglePersist,
	openOnStartup,
	handleToggleOpenOnStartup,
	autoPopOnError,
	handleToggleAutoPop,
	savedRecordsLimit,
	handleLimitChange,
	handleClearSavedRecords,
	pingThreshold,
	setPingThreshold,
	sizeThreshold,
	setSizeThreshold
}: SettingsPopoverProps) {
	if (!showSettings) return null;

	return (
		<div
			className="absolute top-full right-0 origin-top-right mt-1.5 w-64 p-2.5 bg-theme-surface border border-theme-border rounded-lg shadow-2xl z-50 text-li-body space-y-2.5 font-sans max-h-[320px] overflow-y-auto"
			onClick={(e) => e.stopPropagation()}
		>
			<div className="flex items-center justify-between border-b border-theme-border/60 pb-1.5">
				<span className="font-semibold text-theme-text-primary flex items-center gap-1.5 text-pill">
					<Icon icon="settings" className="h-3.5 w-3.5 text-indigo-400" />
					Preferences
				</span>
				<button onClick={() => setShowSettings(false)} className="text-theme-text-muted hover:text-theme-text-primary p-0.5 cursor-pointer border-0 bg-transparent">
					<Icon icon="x" className="h-3 w-3" />
				</button>
			</div>

			{/* Theme Selector */}
			<div className="space-y-1">
				<span className="text-pill font-medium text-theme-text-muted uppercase tracking-wider block">Theme Mode</span>
				<div className="flex items-center gap-1 bg-theme-bg p-1 rounded border border-theme-border/60">
					<button
						onClick={() => {
							if (!isDark) toggleTheme();
						}}
						className={`flex-1 flex items-center justify-center gap-1 py-1 rounded text-pill font-medium cursor-pointer transition-colors border-0 ${isDark ? 'bg-indigo-600 text-white font-semibold' : 'bg-transparent text-theme-text-muted hover:text-theme-text-primary'}`}
					>
						<Icon icon="moon" className="h-3 w-3" />
						<span>Dark</span>
					</button>
					<button
						onClick={() => {
							if (isDark) toggleTheme();
						}}
						className={`flex-1 flex items-center justify-center gap-1 py-1 rounded text-pill font-medium cursor-pointer transition-colors border-0 ${!isDark ? 'bg-indigo-600 text-white font-semibold' : 'bg-transparent text-theme-text-muted hover:text-theme-text-primary'}`}
					>
						<Icon icon="sun" className="h-3 w-3" />
						<span>Light</span>
					</button>
				</div>
			</div>

			{/* Persistence & Saved Records */}
			<div className="space-y-1.5 pt-1 border-t border-theme-border/40">
				<div className="flex items-center justify-between">
					<span className="text-pill font-medium text-theme-text-muted uppercase tracking-wider">Persist Logs Across Reload</span>
					<input
						type="checkbox"
						checked={persistEnabled}
						onChange={handleTogglePersist}
						className="accent-indigo-500 rounded cursor-pointer h-3.5 w-3.5"
					/>
				</div>

				<div className="flex items-center justify-between">
					<span className="text-pill font-medium text-theme-text-muted uppercase tracking-wider">Popup at Start</span>
					<input
						type="checkbox"
						checked={openOnStartup}
						onChange={handleToggleOpenOnStartup}
						className="accent-indigo-500 rounded cursor-pointer h-3.5 w-3.5"
					/>
				</div>

				<div className="flex items-center justify-between">
					<span className="text-pill font-medium text-theme-text-muted uppercase tracking-wider">Auto-pop on Error</span>
					<input
						type="checkbox"
						checked={autoPopOnError}
						onChange={handleToggleAutoPop}
						className="accent-indigo-500 rounded cursor-pointer h-3.5 w-3.5"
					/>
				</div>

				<div className="flex items-center justify-between pt-1">
					<span className="text-theme-text-secondary text-li-body">Records Limit:</span>
					<select
						value={savedRecordsLimit}
						onChange={(e) => handleLimitChange(Number(e.target.value))}
						className="bg-theme-bg border border-theme-border rounded px-2 py-0.5 text-li-body text-theme-text-primary outline-none focus:border-theme-accent cursor-pointer"
					>
						<option value={5}>5 entries</option>
						<option value={10}>10 entries</option>
						<option value={25}>25 entries</option>
						<option value={50}>50 entries</option>
						<option value={100}>100 entries</option>
					</select>
				</div>

				<div className="flex items-center justify-between pt-1">
					<span className="text-theme-text-secondary text-li-body">Ping Warning (ms):</span>
					<input
						type="number"
						value={pingThreshold}
						onChange={(e) => setPingThreshold(Number(e.target.value))}
						className="bg-theme-bg border border-theme-border rounded px-2 py-0.5 text-li-body text-theme-text-primary outline-none focus:border-theme-accent w-16 text-right"
					/>
				</div>

				<div className="flex items-center justify-between pt-1">
					<span className="text-theme-text-secondary text-li-body">Size Warning (KB):</span>
					<input
						type="number"
						value={sizeThreshold}
						onChange={(e) => setSizeThreshold(Number(e.target.value))}
						className="bg-theme-bg border border-theme-border rounded px-2 py-0.5 text-li-body text-theme-text-primary outline-none focus:border-theme-accent w-16 text-right"
					/>
				</div>

				<button
					onClick={handleClearSavedRecords}
					className="w-full mt-2 py-1 px-2 bg-theme-panel hover:bg-rose-500/10 border border-theme-border hover:border-rose-500/40 text-theme-text-secondary hover:text-rose-400 rounded text-pill font-medium transition-colors flex items-center justify-center gap-1 cursor-pointer"
				>
					<Icon icon="trash-2" className="h-3 w-3" />
					<span>Clear Saved Storage</span>
				</button>
			</div>
		</div>
	);
}
