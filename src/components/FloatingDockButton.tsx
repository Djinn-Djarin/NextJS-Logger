import React, { useState, useRef, useEffect } from 'react';
import { Icon } from './Icon';

interface FloatingDockButtonProps {
    collapsed: boolean;
    setCollapsed: (collapsed: boolean) => void;
    markErrorsRead: () => void;
    isDark: boolean;
    className?: string;
    enabled: boolean;
    setEnabled: (val: boolean) => void;
}

export function FloatingDockButton({
    collapsed,
    setCollapsed,
    markErrorsRead,
    isDark,
    className = '',
    enabled,
    setEnabled
}: FloatingDockButtonProps) {
    const [translate, setTranslate] = useState({ x: 0, y: 0 });
    const isDragging = useRef(false);
    const hasDragged = useRef(false);
    const startPos = useRef({ x: 0, y: 0 });
    const dragOffset = useRef({ x: 0, y: 0 });
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number } | null>(null);

    useEffect(() => {
        if (!contextMenu) return;
        const closeMenu = () => setContextMenu(null);
        window.addEventListener('click', closeMenu);
        window.addEventListener('contextmenu', closeMenu);
        return () => {
            window.removeEventListener('click', closeMenu);
            window.removeEventListener('contextmenu', closeMenu);
        };
    }, [contextMenu]);

    const onPointerDown = (e: React.PointerEvent) => {
        // Only allow left click to drag
        if (e.button !== 0) return;
        isDragging.current = true;
        hasDragged.current = false;
        startPos.current = { x: e.clientX, y: e.clientY };
        dragOffset.current = { ...translate };
        e.currentTarget.setPointerCapture(e.pointerId);
    };

    const onPointerMove = (e: React.PointerEvent) => {
        if (!isDragging.current) return;
        const dx = e.clientX - startPos.current.x;
        const dy = e.clientY - startPos.current.y;
        
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
            hasDragged.current = true;
        }
        
        setTranslate({ x: dragOffset.current.x + dx, y: dragOffset.current.y + dy });
    };

    const onPointerUp = (e: React.PointerEvent) => {
        if (!isDragging.current) return;
        isDragging.current = false;
        e.currentTarget.releasePointerCapture(e.pointerId);
    };

    const handleClick = (e: React.MouseEvent) => {
        if (hasDragged.current) return;
        setCollapsed(!collapsed);
        markErrorsRead();
    };

    const handleContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({ x: e.clientX, y: e.clientY });
    };

    return (
        <>
        <button
            id="li-floating-dock-btn"
            onClick={handleClick}
            onContextMenu={handleContextMenu}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            style={{
                position: 'fixed',
                top: '35%',
                right: '18px',
                zIndex: 2147483647,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '30px',
                width: '30px',
                borderRadius: '9999px',
                borderWidth: '2px',
                cursor: 'grab',
                transform: `translate3d(${translate.x}px, ${translate.y}px, 0)`,
                touchAction: 'none' // Prevent scrolling when dragging on touch devices
            }}
            className={`bg-theme-surface shadow-2xl active:scale-95 ${isDark ? 'border-theme-border' : 'border-slate-800 li-light'} ${className}`}
            title={collapsed ? "Open Log Inspector (Right-click to toggle ON/OFF)" : "Hide Log Inspector (Right-click to toggle ON/OFF)"}
        >
            <Icon icon="terminal" className="text-theme-text-primary pointer-events-none" size={15} />
        </button>
            {contextMenu && (
                <div
                    style={{
                        position: 'fixed',
                        top: contextMenu.y,
                        left: contextMenu.x - 160 > 0 ? contextMenu.x - 160 : contextMenu.x,
                        zIndex: 2147483647
                    }}
                    className={`bg-theme-surface border border-theme-border rounded-lg shadow-2xl py-1 w-40 text-li-body ${isDark ? '' : 'li-light'}`}
                >
                    <button
                        className="w-full text-left px-3 py-1.5 hover:bg-theme-panel text-theme-text-primary transition-colors flex items-center gap-2 cursor-pointer border-0 bg-transparent"
                        onClick={(e) => {
                            e.stopPropagation();
                            if (enabled && !collapsed) {
                                setCollapsed(true);
                            } else if (!enabled && collapsed) {
                                setCollapsed(false);
                            }
                            setEnabled(!enabled);
                            setContextMenu(null);
                        }}
                    >
                        <Icon icon={enabled ? 'power' : 'terminal'} className={enabled ? 'text-rose-500' : 'text-emerald-500'} size={14} />
                        {enabled ? 'Disable Inspector' : 'Enable Inspector'}
                    </button>
                </div>
            )}
        </>
    );
}
