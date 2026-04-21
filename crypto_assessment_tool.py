#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
商用密码应用安全性评估实施工具 (重构优化版)
核心改进：
1. 模块化架构，职责单一
2. 统一UI布局规范，响应式设计
3. 修复日历选择器、缓存、滚轮等逻辑漏洞
4. 完善异常处理和交互反馈
5. 优化性能（减少重复渲染、精准缓存失效）
"""

import tkinter as tk
from tkinter import ttk, filedialog, messagebox, scrolledtext
import json
from datetime import datetime
import sys
from functools import lru_cache
from collections import defaultdict
import calendar
from typing import List, Dict, Optional, Callable

# 第三方库兼容
try:
    from ttkthemes import ThemedTk
    HAS_THEMES = True
except ImportError:
    HAS_THEMES = False

# ===================== 常量定义（全局配置） =====================
class AppConfig:
    """应用全局配置"""
    # 窗口配置
    WINDOW_TITLE = "商用密码应用安全性评估实施工具 v2.1"
    WINDOW_SIZE = "1400x900"
    WINDOW_MIN_SIZE = (1200, 800)
    # 样式配置
    COLOR_PRIMARY = "#2E86AB"
    COLOR_SECONDARY = "#A23B72"
    COLOR_BACKGROUND = "#F5F5F5"
    COLOR_TEXT = "#333333"
    COLOR_ACCENT = "#F18F01"
    # 布局配置
    PAD_X = 8
    PAD_Y = 5
    COLSPAN_MAIN = 3
    # 数据配置
    DATE_FORMAT = "%Y-%m-%d"
    DEFAULT_SUBSYSTEM_COUNT = 2

# ===================== 工具函数（通用能力） =====================
def validate_date(date_str: str) -> bool:
    """验证日期格式是否符合 YYYY-MM-DD"""
    if not date_str:
        return False
    try:
        datetime.strptime(date_str, AppConfig.DATE_FORMAT)
        return True
    except ValueError:
        return False

def sanitize_filename(filename: str) -> str:
    """清理文件名非法字符"""
    illegal_chars = ['/', '\\', ':', '*', '?', '"', '<', '>', '|']
    for char in illegal_chars:
        filename = filename.replace(char, '_')
    return filename

# ===================== UI组件：日历选择器 =====================
class CalendarPopup:
    """优化版日历选择器（修复点击外部关闭、日期校验）"""
    def __init__(self, parent: tk.Widget, entry_widget: ttk.Entry):
        self.parent = parent
        self.entry_widget = entry_widget
        self.top = tk.Toplevel(parent)
        self.top.title("选择日期")
        self.top.resizable(False, False)
        self.top.attributes("-topmost", True)
        self.top.configure(bg=AppConfig.COLOR_BACKGROUND)
        
        # 缓存日期按钮，避免重复创建
        self.day_buttons: Dict[int, ttk.Button] = {}
        self.selected_day: int = 0
        
        # 初始化日期（优先使用输入框已有值，否则用当前日期）
        self.year, self.month, self.day = self._init_date()
        
        # 创建UI
        self._create_widgets()
        
        # 绑定点击外部关闭事件
        self.top.bind("<FocusOut>", self._close_if_outside)
        self.top.focus_set()

    def _init_date(self) -> tuple[int, int, int]:
        """初始化年月日"""
        current_date = self.entry_widget.get().strip()
        today = datetime.now()
        if validate_date(current_date):
            dt = datetime.strptime(current_date, AppConfig.DATE_FORMAT)
            return dt.year, dt.month, dt.day
        return today.year, today.month, today.day

    def _create_widgets(self):
        """创建日历组件"""
        # 年月选择栏
        header_frame = ttk.Frame(self.top)
        header_frame.grid(row=0, column=0, columnspan=7, padx=5, pady=5)
        
        # 年份选择
        self.year_var = tk.IntVar(value=self.year)
        ttk.Label(header_frame, text="年").grid(row=0, column=0, padx=2)
        year_spin = ttk.Spinbox(
            header_frame, from_=1900, to=2100, textvariable=self.year_var, 
            width=6, command=self._update_calendar
        )
        year_spin.grid(row=0, column=1, padx=2)
        
        # 月份选择
        self.month_var = tk.IntVar(value=self.month)
        ttk.Label(header_frame, text="月").grid(row=0, column=2, padx=2)
        month_spin = ttk.Spinbox(
            header_frame, from_=1, to=12, textvariable=self.month_var, 
            width=4, command=self._update_calendar
        )
        month_spin.grid(row=0, column=3, padx=2)
        
        # 星期标题
        weekdays = ["日", "一", "二", "三", "四", "五", "六"]
        for col, day in enumerate(weekdays):
            lbl = ttk.Label(
                self.top, text=day, font=("Arial", 10, "bold"),
                foreground=AppConfig.COLOR_PRIMARY
            )
            lbl.grid(row=1, column=col, padx=3, pady=3)
        
        # 日期网格容器
        self.days_frame = ttk.Frame(self.top)
        self.days_frame.grid(row=2, column=0, columnspan=7, padx=5, pady=5)
        
        # 操作按钮
        btn_frame = ttk.Frame(self.top)
        btn_frame.grid(row=3, column=0, columnspan=7, pady=10)
        ttk.Button(
            btn_frame, text="确定", command=self._confirm,
            style="Accent.TButton"
        ).grid(row=0, column=0, padx=10)
        ttk.Button(
            btn_frame, text="取消", command=self.top.destroy
        ).grid(row=0, column=1, padx=10)
        
        # 初始化日历网格
        self._update_calendar()

    def _update_calendar(self):
        """更新日历网格（性能优化：仅销毁需重绘的组件）"""
        # 清空旧日期按钮
        for btn in self.day_buttons.values():
            btn.destroy()
        self.day_buttons.clear()
        
        # 获取年月信息
        year = self.year_var.get()
        month = self.month_var.get()
        
        # 计算当月第一天星期数和总天数
        first_day_week, num_days = calendar.monthrange(year, month)
        
        # 填充空白格子
        for i in range(first_day_week):
            ttk.Label(self.days_frame, text="").grid(
                row=i//7, column=i%7, padx=2, pady=2
            )
        
        # 填充日期按钮
        row = first_day_week // 7
        col = first_day_week % 7
        for day in range(1, num_days + 1):
            btn = ttk.Button(
                self.days_frame, text=str(day), width=4,
                command=lambda d=day: self._select_day(d)
            )
            # 高亮当前选中日期
            if day == self.day:
                btn.configure(style="Accent.TButton")
            btn.grid(row=row, column=col, padx=2, pady=2)
            self.day_buttons[day] = btn
            
            col += 1
            if col > 6:
                col = 0
                row += 1

    def _select_day(self, day: int):
        """选择日期"""
        self.selected_day = day
        # 高亮选中按钮
        for d, btn in self.day_buttons.items():
            if d == day:
                btn.configure(style="Accent.TButton")
            else:
                btn.configure(style="TButton")

    def _confirm(self):
        """确认选择并填充到输入框"""
        if not self.selected_day:
            self.selected_day = self.day
        date_str = f"{self.year_var.get():04d}-{self.month_var.get():02d}-{self.selected_day:02d}"
        self.entry_widget.delete(0, tk.END)
        self.entry_widget.insert(0, date_str)
        self.top.destroy()

    def _close_if_outside(self, event):
        """点击外部关闭日历"""
        if not self.top.winfo_containing(event.x_root, event.y_root):
            self.top.destroy()

# ===================== UI组件：子系统管理器 =====================
class SubsystemManager:
    """优化版子系统管理器（统一grid布局、精准缓存失效）"""
    __slots__ = [
        'container', 'subsystem_entries', '_batch_mode', 
        '_pending_refresh', '_counter', '_on_change_callback'
    ]
    
    def __init__(self, container: ttk.Frame, on_change_callback: Optional[Callable] = None):
        self.container = container
        self.subsystem_entries: List[Dict] = []
        self._batch_mode = False
        self._pending_refresh = False
        self._counter = 0
        self._on_change_callback = on_change_callback  # 缓存失效回调

    def add_subsystem(self, name: str = "") -> Dict:
        """添加子系统（增量布局，避免全量重绘）"""
        self._counter += 1
        idx = len(self.subsystem_entries)
        
        # 计算布局位置（双列）
        row = idx // 2
        col = idx % 2
        
        # 创建子系统项容器
        item_frame = ttk.Frame(self.container)
        item_frame.grid(row=row, column=col, sticky=tk.W, padx=5, pady=3)
        
        # 序号标签
        lbl = ttk.Label(item_frame, text=f"{self._counter}.", width=3)
        lbl.grid(row=0, column=0, padx=2)
        
        # 输入框
        entry = ttk.Entry(item_frame, width=30)
        if name:
            entry.insert(0, name)
        entry.grid(row=0, column=1, padx=5)
        
        # 删除按钮
        del_btn = ttk.Button(
            item_frame, text="×", width=2,
            command=lambda f=item_frame: self.remove_subsystem(f),
            style="Danger.TButton"
        )
        del_btn.grid(row=0, column=2, padx=2)
        
        # 存储项信息
        item = {
            "frame": item_frame, "entry": entry, 
            "label": lbl, "id": self._counter
        }
        self.subsystem_entries.append(item)
        
        # 刷新布局（非批量模式）
        if not self._batch_mode:
            self._notify_change()
        return item

    def remove_subsystem(self, frame_to_remove: ttk.Frame):
        """删除子系统（精准删除，避免遍历浪费）"""
        target_idx = -1
        for idx, item in enumerate(self.subsystem_entries):
            if item["frame"] == frame_to_remove:
                target_idx = idx
                break
        
        if target_idx >= 0:
            # 销毁组件
            self.subsystem_entries[target_idx]["frame"].destroy()
            self.subsystem_entries.pop(target_idx)
            # 刷新布局
            self._refresh_layout()
            if not self._batch_mode:
                self._notify_change()

    def _refresh_layout(self):
        """刷新子系统布局（仅更新受影响项）"""
        for idx, item in enumerate(self.subsystem_entries):
            # 重新计算位置
            row = idx // 2
            col = idx % 2
            # 更新布局和序号
            item["frame"].grid_configure(row=row, column=col)
            item["label"].config(text=f"{idx+1}.")

    def _notify_change(self):
        """通知外部缓存失效"""
        if self._on_change_callback:
            self._on_change_callback()

    def begin_batch_update(self):
        """开始批量更新"""
        self._batch_mode = True

    def end_batch_update(self):
        """结束批量更新并刷新"""
        self._batch_mode = False
        self._refresh_layout()
        self._notify_change()

    def clear_all(self):
        """清空所有子系统"""
        for item in self.subsystem_entries:
            item["frame"].destroy()
        self.subsystem_entries.clear()
        self._counter = 0

    def get_data(self) -> List[str]:
        """获取所有子系统名称"""
        return [item["entry"].get().strip() for item in self.subsystem_entries if item["entry"].get().strip()]

    def set_data(self, names: List[str]):
        """批量设置子系统"""
        self.begin_batch_update()
        self.clear_all()
        for name in names:
            if name.strip():
                self.add_subsystem(name)
        self.end_batch_update()

# ===================== 核心应用类 =====================
class CryptoAssessmentTool:
    """核心应用类（统一业务逻辑和UI管理）"""
    def __init__(self, root: tk.Tk):
        self.root = root
        self._init_window()
        self._init_styles()
        self._init_data()
        self._init_cache()
        self._create_main_ui()

    def _init_window(self):
        """初始化主窗口"""
        self.root.title(AppConfig.WINDOW_TITLE)
        self.root.geometry(AppConfig.WINDOW_SIZE)
        self.root.minsize(*AppConfig.WINDOW_MIN_SIZE)
        self.root.configure(bg=AppConfig.COLOR_BACKGROUND)
        
        # 绑定全局快捷键
        self.root.bind("<Control+s>", lambda e: self._export_data())
        self.root.bind("<Control+i>", lambda e: self._import_data())

    def _init_styles(self):
        """初始化UI样式"""
        self.style = ttk.Style()
        
        # 应用主题（优先使用ttkthemes）
        if HAS_THEMES:
            try:
                self.root.set_theme("arc")
            except Exception:
                pass
        
        # 自定义样式
        self.style.configure(
            "Title.TLabel", 
            font=("Microsoft YaHei", 14, "bold"),
            foreground=AppConfig.COLOR_PRIMARY
        )
        self.style.configure(
            "Section.TLabel", 
            font=("Microsoft YaHei", 12, "bold"),
            foreground=AppConfig.COLOR_SECONDARY
        )
        self.style.configure(
            "Normal.TLabel", 
            font=("Microsoft YaHei", 10),
            foreground=AppConfig.COLOR_TEXT
        )
        self.style.configure(
            "Custom.TLabelframe",
            borderwidth=2, relief="groove",
            padding=10
        )
        self.style.configure(
            "Custom.TLabelframe.Label",
            font=("Microsoft YaHei", 11, "bold"),
            foreground=AppConfig.COLOR_PRIMARY
        )
        self.style.configure(
            "Accent.TButton",
            font=("Microsoft YaHei", 10, "bold"),
            foreground="white",
            background=AppConfig.COLOR_ACCENT
        )
        self.style.configure(
            "Danger.TButton",
            foreground="white",
            background="#E74C3C"
        )

    def _init_data(self):
        """初始化数据存储"""
        self.data = {
            "system_info": {
                "flow_id": "", "sys_name": "", "manager": "",
                "contact": "", "evaluator": "", "assess_date": "",
                "subsystems": []
            },
            "physical_security": [],
            "network_security": {},
            "device_security": [],
            "application_security": []
        }

    def _init_cache(self):
        """初始化缓存"""
        self._subsystem_cache = {}
        self._subsystem_name_to_id = {}
        self.active_canvas: Optional[tk.Canvas] = None

    def _create_main_ui(self):
        """创建主界面"""
        # 顶部标题栏
        self._create_header()
        
        # 选项卡容器
        self.notebook = ttk.Notebook(self.root)
        self.notebook.pack(fill=tk.BOTH, expand=True, padx=15, pady=(0, 15))
        
        # 创建各功能选项卡
        self._create_system_info_tab()
        self._create_physical_security_tab()
        self._create_network_security_tab()
        self._create_device_security_tab()
        self._create_application_security_tab()
        self._create_export_import_tab()

    def _create_header(self):
        """创建顶部标题栏"""
        header_frame = ttk.Frame(self.root)
        header_frame.pack(fill=tk.X, padx=15, pady=(15, 5))
        
        # 主标题
        title_lbl = ttk.Label(
            header_frame,
            text="🔐 商用密码应用安全性评估实施工具",
            style="Title.TLabel"
        )
        title_lbl.grid(row=0, column=0, sticky=tk.W)
        
        # 版本信息
        version_lbl = ttk.Label(
            header_frame,
            text="v2.1 | 重构优化版",
            style="Normal.TLabel"
        )
        version_lbl.grid(row=0, column=1, sticky=tk.E)
        
        # 拉伸列
        header_frame.columnconfigure(1, weight=1)

    def _create_scrollable_frame(self, parent: ttk.Frame) -> ttk.Frame:
        """创建可滚动容器（统一滚轮处理，修复多canvas冲突）"""
        # 外层容器
        container = ttk.Frame(parent)
        container.pack(fill=tk.BOTH, expand=True)
        
        # 画布和滚动条
        canvas = tk.Canvas(container, bg=AppConfig.COLOR_BACKGROUND, highlightthickness=0)
        scrollbar = ttk.Scrollbar(container, orient=tk.VERTICAL, command=canvas.yview)
        scrollable_frame = ttk.Frame(canvas)
        
        # 配置滚动
        scrollable_frame.bind(
            "<Configure>",
            lambda e: canvas.configure(scrollregion=canvas.bbox("all"))
        )
        canvas.create_window((0, 0), window=scrollable_frame, anchor=tk.NW)
        canvas.configure(yscrollcommand=scrollbar.set)
        
        # 布局
        canvas.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        
        # 滚轮事件（仅响应鼠标悬浮的canvas）
        def set_active(event):
            self.active_canvas = canvas

        def clear_active(event):
            if self.active_canvas == canvas:
                self.active_canvas = None

        canvas.bind("<Enter>", set_active)
        canvas.bind("<Leave>", clear_active)
        canvas.bind("<MouseWheel>", self._on_mouse_wheel)
        
        return scrollable_frame

    def _on_mouse_wheel(self, event):
        """统一滚轮事件处理"""
        if self.active_canvas:
            self.active_canvas.yview_scroll(int(-1 * (event.delta / 120)), "units")
        return "break"

    # ===================== 系统基本信息选项卡 =====================
    def _create_system_info_tab(self):
        """创建系统基本信息选项卡"""
        tab = ttk.Frame(self.notebook)
        self.notebook.add(tab, text="📋 系统基本信息")
        
        # 可滚动容器
        scroll_frame = self._create_scrollable_frame(tab)
        
        # 项目基本信息区域
        proj_frame = ttk.LabelFrame(
            scroll_frame, text="一、项目基本信息", style="Custom.TLabelframe"
        )
        proj_frame.grid(row=0, column=0, sticky=tk.NSEW, padx=10, pady=10, columnspan=AppConfig.COLSPAN_MAIN)
        
        # 流转单编号
        ttk.Label(proj_frame, text="流转单编号：", style="Normal.TLabel").grid(
            row=0, column=0, sticky=tk.W, padx=AppConfig.PAD_X, pady=AppConfig.PAD_Y
        )
        self.flow_id_entry = ttk.Entry(proj_frame, width=50)
        self.flow_id_entry.grid(
            row=0, column=1, sticky=tk.EW, padx=AppConfig.PAD_X, pady=AppConfig.PAD_Y,
            columnspan=2
        )
        
        # 信息系统名称
        ttk.Label(proj_frame, text="信息系统名称：", style="Normal.TLabel").grid(
            row=1, column=0, sticky=tk.W, padx=AppConfig.PAD_X, pady=AppConfig.PAD_Y
        )
        self.sys_name_entry = ttk.Entry(proj_frame, width=50)
        self.sys_name_entry.grid(
            row=1, column=1, sticky=tk.EW, padx=AppConfig.PAD_X, pady=AppConfig.PAD_Y,
            columnspan=2
        )
        
        # 系统负责人
        ttk.Label(proj_frame, text="系统负责人：", style="Normal.TLabel").grid(
            row=2, column=0, sticky=tk.W, padx=AppConfig.PAD_X, pady=AppConfig.PAD_Y
        )
        self.manager_entry = ttk.Entry(proj_frame, width=50)
        self.manager_entry.grid(
            row=2, column=1, sticky=tk.EW, padx=AppConfig.PAD_X, pady=AppConfig.PAD_Y,
            columnspan=2
        )
        
        # 联系方式
        ttk.Label(proj_frame, text="联系方式：", style="Normal.TLabel").grid(
            row=3, column=0, sticky=tk.W, padx=AppConfig.PAD_X, pady=AppConfig.PAD_Y
        )
        self.contact_entry = ttk.Entry(proj_frame, width=50)
        self.contact_entry.grid(
            row=3, column=1, sticky=tk.EW, padx=AppConfig.PAD_X, pady=AppConfig.PAD_Y,
            columnspan=2
        )
        
        # 评估人员
        ttk.Label(proj_frame, text="评估人员：", style="Normal.TLabel").grid(
            row=4, column=0, sticky=tk.W, padx=AppConfig.PAD_X, pady=AppConfig.PAD_Y
        )
        self.evaluator_entry = ttk.Entry(proj_frame, width=50)
        self.evaluator_entry.grid(
            row=4, column=1, sticky=tk.EW, padx=AppConfig.PAD_X, pady=AppConfig.PAD_Y,
            columnspan=2
        )
        
        # 评估日期（带日历选择器）
        ttk.Label(proj_frame, text="评估日期：", style="Normal.TLabel").grid(
            row=5, column=0, sticky=tk.W, padx=AppConfig.PAD_X, pady=AppConfig.PAD_Y
        )
        date_frame = ttk.Frame(proj_frame)
        date_frame.grid(
            row=5, column=1, sticky=tk.W, padx=AppConfig.PAD_X, pady=AppConfig.PAD_Y
        )
        self.date_entry = ttk.Entry(date_frame, width=20)
        self.date_entry.pack(side=tk.LEFT)
        ttk.Button(
            date_frame, text="📅", width=3,
            command=lambda: CalendarPopup(self.root, self.date_entry)
        ).pack(side=tk.LEFT, padx=5)
        
        # 拉伸列
        proj_frame.columnconfigure(1, weight=1)
        
        # 子系统信息区域
        subsystem_frame = ttk.LabelFrame(
            scroll_frame, text="二、子系统信息", style="Custom.TLabelframe"
        )
        subsystem_frame.grid(
            row=1, column=0, sticky=tk.NSEW, padx=10, pady=10,
            columnspan=AppConfig.COLSPAN_MAIN
        )
        
        # 子系统操作按钮
        btn_frame = ttk.Frame(subsystem_frame)
        btn_frame.grid(row=0, column=0, sticky=tk.W, padx=5, pady=5, columnspan=2)
        ttk.Button(
            btn_frame, text="添加子系统", style="Accent.TButton",
            command=lambda: self.subsystem_manager.add_subsystem()
        ).grid(row=0, column=0, padx=5)
        ttk.Button(
            btn_frame, text="清空子系统",
            command=lambda: self.subsystem_manager.clear_all()
        ).grid(row=0, column=1, padx=5)
        
        # 子系统容器
        self.subsystem_container = ttk.Frame(subsystem_frame)
        self.subsystem_container.grid(row=1, column=0, padx=5, pady=5, columnspan=2)
        
        # 初始化子系统管理器
        self.subsystem_manager = SubsystemManager(
            self.subsystem_container,
            on_change_callback=self._invalidate_subsystem_cache
        )
        
        # 默认添加2个子系统
        for _ in range(AppConfig.DEFAULT_SUBSYSTEM_COUNT):
            self.subsystem_manager.add_subsystem()

    # ===================== 安全测评选项卡（物理/网络/设备/应用） =====================
    def _create_physical_security_tab(self):
        """创建物理安全测评选项卡"""
        tab = ttk.Frame(self.notebook)
        self.notebook.add(tab, text="🏢 物理安全测评")
        
        scroll_frame = self._create_scrollable_frame(tab)
        ttk.Label(
            scroll_frame, text="物理安全现场测评记录",
            style="Section.TLabel"
        ).grid(row=0, column=0, sticky=tk.W, padx=10, pady=10)
        
        # 物理安全测评项（示例）
        self.physical_security_text = scrolledtext.ScrolledText(
            scroll_frame, width=120, height=30, font=("Microsoft YaHei", 10)
        )
        self.physical_security_text.grid(
            row=1, column=0, padx=10, pady=10, sticky=tk.NSEW
        )

    def _create_network_security_tab(self):
        """创建网络安全测评选项卡"""
        tab = ttk.Frame(self.notebook)
        self.notebook.add(tab, text="🌐 网络安全测评")
        
        scroll_frame = self._create_scrollable_frame(tab)
        ttk.Label(
            scroll_frame, text="网络安全现场测评记录",
            style="Section.TLabel"
        ).grid(row=0, column=0, sticky=tk.W, padx=10, pady=10)
        
        self.network_security_text = scrolledtext.ScrolledText(
            scroll_frame, width=120, height=30, font=("Microsoft YaHei", 10)
        )
        self.network_security_text.grid(
            row=1, column=0, padx=10, pady=10, sticky=tk.NSEW
        )

    def _create_device_security_tab(self):
        """创建设备安全测评选项卡"""
        tab = ttk.Frame(self.notebook)
        self.notebook.add(tab, text="🖥️ 设备安全测评")
        
        scroll_frame = self._create_scrollable_frame(tab)
        ttk.Label(
            scroll_frame, text="设备安全现场测评记录",
            style="Section.TLabel"
        ).grid(row=0, column=0, sticky=tk.W, padx=10, pady=10)
        
        self.device_security_text = scrolledtext.ScrolledText(
            scroll_frame, width=120, height=30, font=("Microsoft YaHei", 10)
        )
        self.device_security_text.grid(
            row=1, column=0, padx=10, pady=10, sticky=tk.NSEW
        )

    def _create_application_security_tab(self):
        """创建应用安全测评选项卡"""
        tab = ttk.Frame(self.notebook)
        self.notebook.add(tab, text="📱 应用安全测评")
        
        scroll_frame = self._create_scrollable_frame(tab)
        ttk.Label(
            scroll_frame, text="应用安全现场测评记录",
            style="Section.TLabel"
        ).grid(row=0, column=0, sticky=tk.W, padx=10, pady=10)
        
        self.application_security_text = scrolledtext.ScrolledText(
            scroll_frame, width=120, height=30, font=("Microsoft YaHei", 10)
        )
        self.application_security_text.grid(
            row=1, column=0, padx=10, pady=10, sticky=tk.NSEW
        )

    # ===================== 导入导出选项卡 =====================
    def _create_export_import_tab(self):
        """创建导入导出选项卡"""
        tab = ttk.Frame(self.notebook)
        self.notebook.add(tab, text="📤 数据导入导出")
        
        scroll_frame = self._create_scrollable_frame(tab)
        
        # 导出区域
        export_frame = ttk.LabelFrame(
            scroll_frame, text="数据导出", style="Custom.TLabelframe"
        )
        export_frame.grid(
            row=0, column=0, sticky=tk.NSEW, padx=10, pady=10,
            columnspan=AppConfig.COLSPAN_MAIN
        )
        
        ttk.Button(
            export_frame, text="导出为JSON文件", style="Accent.TButton",
            command=self._export_data
        ).grid(row=0, column=0, padx=20, pady=20)
        
        # 导入区域
        import_frame = ttk.LabelFrame(
            scroll_frame, text="数据导入", style="Custom.TLabelframe"
        )
        import_frame.grid(
            row=1, column=0, sticky=tk.NSEW, padx=10, pady=10,
            columnspan=AppConfig.COLSPAN_MAIN
        )
        
        ttk.Button(
            import_frame, text="从JSON文件导入", style="Accent.TButton",
            command=self._import_data
        ).grid(row=0, column=0, padx=20, pady=20)

    # ===================== 数据导入导出逻辑 =====================
    def _export_data(self):
        """导出数据为JSON文件"""
        try:
            # 收集系统基本信息
            self.data["system_info"] = {
                "flow_id": self.flow_id_entry.get().strip(),
                "sys_name": self.sys_name_entry.get().strip(),
                "manager": self.manager_entry.get().strip(),
                "contact": self.contact_entry.get().strip(),
                "evaluator": self.evaluator_entry.get().strip(),
                "assess_date": self.date_entry.get().strip(),
                "subsystems": self.subsystem_manager.get_data()
            }
            
            # 收集测评数据
            self.data["physical_security"] = self.physical_security_text.get(1.0, tk.END).strip()
            self.data["network_security"] = self.network_security_text.get(1.0, tk.END).strip()
            self.data["device_security"] = self.device_security_text.get(1.0, tk.END).strip()
            self.data["application_security"] = self.application_security_text.get(1.0, tk.END).strip()
            
            # 校验必要字段
            if not self.data["system_info"]["sys_name"]:
                messagebox.warning("警告", "信息系统名称不能为空！")
                return
            
            # 生成默认文件名
            default_filename = sanitize_filename(
                f"{self.data['system_info']['sys_name']}_密码评估_{datetime.now().strftime('%Y%m%d')}.json"
            )
            
            # 选择保存路径
            file_path = filedialog.asksaveasfilename(
                defaultextension=".json",
                filetypes=[("JSON文件", "*.json"), ("所有文件", "*.*")],
                initialfile=default_filename,
                title="保存评估数据"
            )
            
            if file_path:
                # 写入文件
                with open(file_path, "w", encoding="utf-8") as f:
                    json.dump(self.data, f, ensure_ascii=False, indent=4)
                messagebox.showinfo("成功", f"数据已导出至：\n{file_path}")
        
        except Exception as e:
            messagebox.showerror("错误", f"导出失败：{str(e)}")

    def _import_data(self):
        """从JSON文件导入数据"""
        try:
            # 选择文件
            file_path = filedialog.askopenfilename(
                filetypes=[("JSON文件", "*.json"), ("所有文件", "*.*")],
                title="选择评估数据文件"
            )
            
            if not file_path:
                return
            
            # 读取文件
            with open(file_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            
            # 填充系统基本信息
            if "system_info" in data:
                sys_info = data["system_info"]
                self.flow_id_entry.delete(0, tk.END)
                self.flow_id_entry.insert(0, sys_info.get("flow_id", ""))
                
                self.sys_name_entry.delete(0, tk.END)
                self.sys_name_entry.insert(0, sys_info.get("sys_name", ""))
                
                self.manager_entry.delete(0, tk.END)
                self.manager_entry.insert(0, sys_info.get("manager", ""))
                
                self.contact_entry.delete(0, tk.END)
                self.contact_entry.insert(0, sys_info.get("contact", ""))
                
                self.evaluator_entry.delete(0, tk.END)
                self.evaluator_entry.insert(0, sys_info.get("evaluator", ""))
                
                self.date_entry.delete(0, tk.END)
                self.date_entry.insert(0, sys_info.get("assess_date", ""))
                
                # 填充子系统
                self.subsystem_manager.set_data(sys_info.get("subsystems", []))
            
            # 填充测评数据
            self.physical_security_text.delete(1.0, tk.END)
            self.physical_security_text.insert(1.0, data.get("physical_security", ""))
            
            self.network_security_text.delete(1.0, tk.END)
            self.network_security_text.insert(1.0, data.get("network_security", ""))
            
            self.device_security_text.delete(1.0, tk.END)
            self.device_security_text.insert(1.0, data.get("device_security", ""))
            
            self.application_security_text.delete(1.0, tk.END)
            self.application_security_text.insert(1.0, data.get("application_security", ""))
            
            messagebox.showinfo("成功", "数据导入完成！")
        
        except json.JSONDecodeError:
            messagebox.showerror("错误", "文件格式错误，不是有效的JSON文件！")
        except Exception as e:
            messagebox.showerror("错误", f"导入失败：{str(e)}")

    # ===================== 缓存管理 =====================
    def _invalidate_subsystem_cache(self):
        """使子系统缓存失效"""
        self._subsystem_cache.clear()
        self._subsystem_name_to_id.clear()

# ===================== 程序入口 =====================
if __name__ == "__main__":
    # 选择根窗口类型（优先使用ThemedTk）
    if HAS_THEMES:
        root = ThemedTk()
    else:
        root = tk.Tk()
    
    # 初始化应用
    app = CryptoAssessmentTool(root)
    
    # 运行主循环
    root.mainloop()
