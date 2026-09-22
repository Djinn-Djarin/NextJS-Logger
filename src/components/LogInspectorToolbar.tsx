import React, { type ReactNode } from 'react';
import { Icon } from './Icon';

interface LogInspectorToolbarProps {
	searchQuery: string;
	setSearchQuery: (query: string) => void;
	filterMethod: string;
	setFilterMethod: (method: string) => void;
	filterStatus: string;
	setFilterStatus: (status: string) => void;
	filterTag: string;
	setFilterTag: (tag: string) => void;
	filterInitiator: string;
	setFilterInitiator: (initiator: string) => void;
	tagOptions: string[];
	initiatorOptions: string[];
	hasActiveFilters: boolean;
	fullscreen: boolean;
	toggleFullscreen: () => void;
	setCollapsed: (collapsed: boolean) => void;
	markErrorsRead: () => void;
	copyAllLogs: (e: React.MouseEvent) => void;
	handleClear: () => void;
	children?: ReactNode; // For SettingsPopover
}

export function LogInspectorToolbar({
	searchQuery,
	setSearchQuery,
	filterMethod,
	setFilterMethod,
	filterStatus,
	setFilterStatus,
	filterTag,
	setFilterTag,
	filterInitiator,
	setFilterInitiator,
	tagOptions,
	initiatorOptions,
	hasActiveFilters,
	fullscreen,
	toggleFullscreen,
	setCollapsed,
	markErrorsRead,
	copyAllLogs,
	handleClear,
	children
}: LogInspectorToolbarProps) {
	return (
		<div className="flex items-center gap-2 px-3 py-1.5 bg-theme-surface/70 border-b border-theme-border/70 shrink-0 text-li-body flex-wrap">
			{/* Search Input */}
			<div className="relative flex max-w-xs">
				<div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
					<Icon icon="search" className="h-3.5 w-3.5 text-theme-text-secondary" />
				</div>
				<input
					type="text"
					value={searchQuery}
					onChange={(e) => setSearchQuery(e.target.value)}
					placeholder="Search logs, URLs, status..."
					className="w-full pl-8 pr-7 py-1 bg-theme-bg border border-theme-border rounded text-li-body text-theme-text-primary placeholder:text-theme-text-secondary outline-none focus:border-theme-accent transition-colors"
				/>
				{searchQuery && (
					<div className="absolute inset-y-0 right-0 pr-2 flex items-center">
						<button
							onClick={() => setSearchQuery('')}
							className="text-theme-text-secondary hover:text-theme-text-primary cursor-pointer p-0.5 rounded flex items-center justify-center border-0 bg-transparent"
						>
							<Icon icon="x" className="h-3 w-3" />
						</button>
					</div>
				)}
			</div>

			{/* Method Filter */}
			<div className="flex items-center gap-1">
				
				<select
					value={filterMethod}
					onChange={(e) => setFilterMethod(e.target.value)}
					className="bg-theme-bg border border-theme-border rounded px-2 py-1 text-li-body text-theme-text-primary outline-none focus:border-theme-accent cursor-pointer"
				>
					<option value="ALL">All Methods</option>
					<option value="NETWORK_ONLY">Network Only</option>
					<option value="LOGS_ONLY">Logs Only</option>
					<option value="GET">GET</option>
					<option value="POST">POST</option>
					<option value="PUT">PUT</option>
					<option value="DELETE">DELETE</option>
					<option value="PATCH">PATCH</option>
				</select>
			</div>

			{/* Status Filter */}
			<div className="flex items-center gap-1">
			
				<select
					value={filterStatus}
					onChange={(e) => setFilterStatus(e.target.value)}
					className="bg-theme-bg border border-theme-border rounded px-2 py-1 text-li-body text-theme-text-primary outline-none focus:border-theme-accent cursor-pointer"
				>
					<option value="ALL">All Status</option>
					<option value="SUCCESS">Success (2xx)</option>
					<option value="ERROR">Errors (4xx / 5xx)</option>
				</select>
			</div>

			{/* Tag Filter */}
			<div className="flex items-center gap-1">

				<select
					value={filterTag}
					onChange={(e) => setFilterTag(e.target.value)}
					className="bg-theme-bg border border-theme-border rounded px-2 py-1 text-li-body text-theme-text-primary outline-none focus:border-theme-accent cursor-pointer"
				>
					<option value="ALL">All Tags</option>
					{tagOptions.map((opt) => (
						<option key={opt} value={opt}>
							{opt}
						</option>
					))}
				</select>
			</div>

			{/* Initiator Filter (Last Filter Option) */}
			<div className="flex items-center gap-1">
	
				<select
					value={filterInitiator}
					onChange={(e) => setFilterInitiator(e.target.value)}
					style={{ maxWidth: '120px' }}
					className="bg-theme-bg border border-theme-border rounded px-2 py-1 text-li-body text-theme-text-primary outline-none focus:border-theme-accent cursor-pointer text-ellipsis"
				>
					<option value="ALL">All Initiators</option>
					{initiatorOptions.map((opt) => (
						<option key={opt} value={opt}>
							{opt}
						</option>
					))}
				</select>
			</div>

			{/* Settings Component injected here */}
			{children}

			{/* Reset Filters */}
			{hasActiveFilters && (
				<button
					onClick={() => {
						setSearchQuery('');
						setFilterMethod('ALL');
						setFilterStatus('ALL');
						setFilterTag('ALL');
						setFilterInitiator('ALL');
					}}
					className="text-pill text-indigo-400 hover:text-indigo-300 hover:underline cursor-pointer border-0 bg-transparent"
				>
					Reset Filters
				</button>
			)}

			{/* Action buttons (copy, clear, fullscreen, collapse) */}
			<div className="relative flex items-center gap-1 ml-auto shrink-0">
				<button
					onClick={copyAllLogs}
					className="p-1 text-theme-text-secondary hover:text-theme-text-primary hover:bg-theme-panel rounded cursor-pointer transition-colors border-0 bg-transparent"
					title="Copy all logs"
				>
					<Icon icon="copy" className="h-3.5 w-3.5" />
				</button>
				<button
					onClick={handleClear}
					className="p-1 text-theme-text-secondary hover:text-theme-danger hover:bg-theme-panel rounded cursor-pointer transition-colors border-0 bg-transparent"
					title="Clear all records"
				>
					<Icon icon="trash-2" className="h-3.5 w-3.5" />
				</button>
				<button
					onClick={toggleFullscreen}
					className="p-1 text-theme-text-secondary hover:text-theme-text-primary hover:bg-theme-panel rounded cursor-pointer transition-colors border-0 bg-transparent"
					title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
				>
					<Icon icon={fullscreen ? 'minimize-2' : 'maximize-2'} className="h-3.5 w-3.5" />
				</button>


			</div>
		</div>
	);
}
