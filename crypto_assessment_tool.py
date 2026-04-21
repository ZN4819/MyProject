#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
商用密码应用安全性评估实施工具 (完整版)
功能：
1. 可视化图形界面
2. 被评估信息系统基本信息录入（含日历选择、动态子系统、级联显示）
3. 四个技术层面现场测评实施记录（物理、网络、设备、应用）
4. 文件导出功能（JSON 格式）
5. 文件导入功能（支持团队协作）
"""

import tkinter as tk
from tkinter import ttk, filedialog, messagebox, scrolledtext
import json
from datetime import datetime
import sys
from functools import lru_cache
from collections import defaultdict

try:
    from ttkthemes import ThemedTk
    HAS_THEMES = True
except ImportError:
    HAS_THEMES = False


# 定义tkinter常量
W = tk.W
E = tk.E
N = tk.N
S = tk.S
NW = tk.NW
NE = tk.NE
SW = tk.SW
SE = tk.SE
BOTH = tk.BOTH
X = tk.X
Y = tk.Y
LEFT = tk.LEFT
RIGHT = tk.RIGHT
TOP = tk.TOP
BOTTOM = tk.BOTTOM
END = tk.END


class CalendarPopup:
    """简易日历选择器 - 性能优化版"""

    def __init__(self, parent, entry_widget):
        self.parent = parent
        self.entry_widget = entry_widget
        self.top = tk.Toplevel(parent)
        self.top.title("选择日期")
        self.top.resizable(False, False)
        self.top.attributes("-topmost", True)
        
        # 缓存日期按钮引用，避免重复创建 lambda
        self.day_buttons = {}

        # 获取当前日期或输入框中的日期
        current_date = self.entry_widget.get().strip()
        try:
            if current_date:
                parts = current_date.split("-")
                self.year = int(parts[0])
                self.month = int(parts[1])
                self.day = int(parts[2])
            else:
                today = datetime.now()
                self.year = today.year
                self.month = today.month
                self.day = today.day
        except (ValueError, IndexError):
            today = datetime.now()
            self.year = today.year
            self.month = today.month
            self.day = today.day

        self.create_calendar()

        # 点击外部关闭
        self.top.bind("<Button-1>", self.close_if_outside)

    def create_calendar(self):
        # 头部：年月选择
        header_frame = ttk.Frame(self.top)
        header_frame.grid(row=0, column=0, columnspan=7, pady=5)

        self.year_var = tk.IntVar(value=self.year)
        self.month_var = tk.IntVar(value=self.month)

        ttk.Label(header_frame, text="年").pack(side=LEFT, padx=2)
        year_spin = ttk.Spinbox(
            header_frame, from_=1900, to=2100, textvariable=self.year_var, width=6, command=self.update_calendar
        )
        year_spin.pack(side=LEFT, padx=2)

        ttk.Label(header_frame, text="月").pack(side=LEFT, padx=2)
        month_spin = ttk.Spinbox(
            header_frame, from_=1, to=12, textvariable=self.month_var, width=4, command=self.update_calendar
        )
        month_spin.pack(side=LEFT, padx=2)

        # 星期头
        weekdays = ["日", "一", "二", "三", "四", "五", "六"]
        for i, day in enumerate(weekdays):
            ttk.Label(self.top, text=day, font=("Arial", 10, "bold")).grid(row=1, column=i, padx=5, pady=5)

        # 日期网格
        self.days_frame = ttk.Frame(self.top)
        self.days_frame.grid(row=2, column=0, columnspan=7)
        self.update_calendar()

        # 底部按钮
        btn_frame = ttk.Frame(self.top)
        btn_frame.grid(row=3, column=0, columnspan=7, pady=10)
        ttk.Button(btn_frame, text="确定", command=self.confirm).pack(side=LEFT, padx=10)
        ttk.Button(btn_frame, text="取消", command=self.top.destroy).pack(side=LEFT, padx=10)

    def update_calendar(self):
        # 清空旧日期
        for widget in self.days_frame.winfo_children():
            widget.destroy()
        self.day_buttons.clear()

        y = self.year_var.get()
        m = self.month_var.get()

        # 计算当月第一天是星期几和总天数
        import calendar

        first_day, num_days = calendar.monthrange(y, m)

        # 填充空白
        for i in range(first_day):
            ttk.Label(self.days_frame, text="", width=4).grid(row=i // 7, column=i % 7, padx=2, pady=2)

        # 填充日期 - 使用闭包优化避免重复创建 lambda
        row = first_day // 7
        col = first_day % 7
        for d in range(1, num_days + 1):
            btn = ttk.Button(self.days_frame, text=str(d), width=4)
            # 使用 bind 替代 command，避免 lambda 闭包
            btn.bind("<Button-1>", lambda e, day=d: self.select_date(day))
            if d == self.day:
                btn.configure(style="Accent.TButton")  # 高亮当前选中的日（如果主题支持）
            btn.grid(row=row, column=col, padx=2, pady=2)
            self.day_buttons[d] = btn  # 缓存引用
            col += 1
            if col > 6:
                col = 0
                row += 1

    def select_date(self, day):
        self.day = day
        self.confirm()

    def confirm(self):
        date_str = f"{self.year_var.get():04d}-{self.month_var.get():02d}-{self.day:02d}"
        self.entry_widget.delete(0, END)
        self.entry_widget.insert(0, date_str)
        self.top.destroy()

    def close_if_outside(self, event):
        # 简单的点击外部关闭逻辑，实际可能需要更复杂的判断
        pass


def create_date_entry(parent, row, col, label_text, colspan=1):
    """创建带日历按钮的日期输入行 - 性能优化版"""
    ttk.Label(parent, text=label_text).grid(row=row, column=col, sticky=W, pady=5, padx=5)

    entry_frame = ttk.Frame(parent)
    entry_frame.grid(row=row, column=col + 1, sticky=W + E, columnspan=colspan, pady=5, padx=5)

    entry = ttk.Entry(entry_frame, width=15)
    entry.pack(side=LEFT, fill=X, expand=True)

    # 使用 method reference 替代 lambda
    btn = ttk.Button(entry_frame, text="📅", width=3, command=lambda pf=parent, ef=entry: CalendarPopup(pf, ef))
    btn.pack(side=LEFT, padx=(5, 0))

    return entry


class SubsystemManager:
    """
    子系统管理器 - 优化版本
    解决性能问题：
    1. 避免频繁使用 winfo_children() 遍历
    2. 增量更新布局而非全量重绘
    3. 支持批量更新机制
    4. 使用 __slots__ 减少内存占用
    """
    __slots__ = ['container', 'subsystem_entries', '_batch_mode', '_pending_refresh', '_counter', '_on_change_callback']
    
    def __init__(self, container, on_change_callback=None):
        self.container = container
        self.subsystem_entries = []
        self._batch_mode = False
        self._pending_refresh = False
        self._counter = 0
        self._on_change_callback = on_change_callback  # 变化回调，用于通知缓存失效
    
    def add_subsystem(self, name=""):
        """添加一个子系统，使用增量布局"""
        self._counter += 1
        row = len(self.subsystem_entries)
        c = row % 2
        r = row // 2

        frame = ttk.Frame(self.container)
        # 使用 grid 而不触发不必要的事件
        frame.grid(row=r, column=c, sticky=W, padx=10, pady=2)

        lbl = ttk.Label(frame, text=f"{self._counter}.")
        lbl.pack(side=LEFT)

        entry = ttk.Entry(frame, width=20)
        if name:
            entry.insert(0, name)
        entry.pack(side=LEFT, padx=5)

        del_btn = ttk.Button(frame, text="×", width=2, command=lambda f=frame: self.remove_subsystem(f))
        del_btn.pack(side=LEFT)

        item = {"frame": frame, "entry": entry, "label": lbl, "id": self._counter}
        self.subsystem_entries.append(item)
        
        # 非批量模式下立即刷新编号，批量模式下延迟刷新
        if not self._batch_mode:
            self._refresh_labels_incremental(len(self.subsystem_entries) - 1)
            # 通知外部缓存失效
            if self._on_change_callback:
                self._on_change_callback()
        else:
            self._pending_refresh = True
        
        return item
    
    def remove_subsystem(self, frame_to_remove):
        """移除一个子系统，使用增量布局"""
        for i, item in enumerate(self.subsystem_entries):
            if item["frame"] == frame_to_remove:
                item["frame"].destroy()
                self.subsystem_entries.pop(i)
                break
        
        # 非批量模式下立即刷新编号，批量模式下延迟刷新
        if not self._batch_mode:
            self._refresh_layout_incremental()
            # 通知外部缓存失效
            if self._on_change_callback:
                self._on_change_callback()
        else:
            self._pending_refresh = True
    
    def _refresh_labels_incremental(self, start_index=0):
        """增量刷新标签编号，仅更新受影响的项"""
        for i in range(start_index, len(self.subsystem_entries)):
            self.subsystem_entries[i]["label"].config(text=f"{i+1}.")
    
    def _refresh_layout_incremental(self):
        """增量刷新布局，避免全量重绘"""
        for i, item in enumerate(self.subsystem_entries):
            c = i % 2
            r = i // 2
            # 直接使用 grid_configure 更新位置，而不是 grid_forget + grid
            item["frame"].grid_configure(row=r, column=c)
            item["label"].config(text=f"{i+1}.")
    
    def begin_batch_update(self):
        """开始批量更新模式"""
        self._batch_mode = True
        self._pending_refresh = False
    
    def end_batch_update(self):
        """结束批量更新模式并执行一次刷新"""
        self._batch_mode = False
        if self._pending_refresh:
            self._refresh_layout_incremental()
            self._pending_refresh = False
            # 批量更新完成后通知外部缓存失效
            if self._on_change_callback:
                self._on_change_callback()
    
    def clear_all(self):
        """清空所有子系统，优化的清空方法"""
        for item in self.subsystem_entries:
            item["frame"].destroy()
        self.subsystem_entries.clear()
        self._counter = 0
    
    def get_data(self):
        """获取所有子系统数据"""
        return [item["entry"].get() for item in self.subsystem_entries]
    
    def set_data(self, names):
        """批量设置子系统数据"""
        self.begin_batch_update()
        self.clear_all()
        for name in names:
            self.add_subsystem(name)
        self.end_batch_update()


class CryptoAssessmentTool:
    def __init__(self, root):
        self.root = root
        self.root.title("商用密码应用安全性评估实施工具")
        self.root.geometry("1400x900")
        
        # 设置窗口最小尺寸
        self.root.minsize(1200, 800)
        
        # 配置样式
        self.setup_styles()

        # 数据存储字典 - 使用扁平化结构优化查找效率
        self.data = {
            "system_info": {},
            "physical_security": [],
            "network_security": {},  # 改为 dict 以支持子系统索引
            "device_security": [],
            "application_security": [],
        }

        # 用于存储动态子系统的引用 (由 SubsystemManager 管理)
        self.subsystem_manager = None
        
        # 当前活动的 Canvas 引用，用于滚轮事件管理
        self.active_canvas = None
        
        # 数据缓存 - 避免重复计算子系统编号等数据
        self._subsystem_cache = {}
        self._subsystem_name_to_id = {}
        
        # UI 组件缓存 - 避免重复查找
        self._widget_cache = {}

        # 创建主界面
        self.create_main_interface()
    
    def setup_styles(self):
        """配置 UI 样式"""
        # 配置 ttk 样式
        style = ttk.Style()
        
        # 尝试使用更现代的主题
        if HAS_THEMES:
            try:
                self.root.set_theme("arc")  # 或者 'breeze', 'clam'
            except:
                pass
        
        # 自定义样式
        style.configure('Title.TLabel', font=('Arial', 14, 'bold'))
        style.configure('Section.TLabel', font=('Arial', 12, 'bold'))
        style.configure('Normal.TLabel', font=('Arial', 10))
        style.configure('Header.TButton', font=('Arial', 11, 'bold'))
        style.configure('Card.TFrame', background='#f5f5f5')
        
        # 配置 LabelFrame 样式
        style.configure('Custom.TLabelframe', borderwidth=2, relief='groove')
        style.configure('Custom.TLabelframe.Label', font=('Arial', 11, 'bold'), foreground='#333')
    
    def _on_mouse_wheel(self, event):
        """统一的鼠标滚轮事件处理 - 仅响应活动 Canvas"""
        if self.active_canvas:
            self.active_canvas.yview_scroll(int(-1*(event.delta/120)), "units")
        return "break"
    
    def _get_subsystems(self):
        """获取子系统列表 - 带缓存优化
        
        Returns:
            list: 子系统名称列表
        """
        # 检查缓存是否有效
        if '_subsystems' in self._subsystem_cache:
            cached_data = self._subsystem_cache['_subsystems']
            # 验证缓存是否过期（如果 subsystem_manager 存在且未变化）
            if hasattr(self, 'subsystem_manager') and self.subsystem_manager:
                current_data = self.subsystem_manager.get_data()
                if cached_data == current_data:
                    return cached_data
        
        # 从系统信息中获取
        subsystems = []
        if "system_info" in self.data and "system" in self.data["system_info"]:
            subsystems = self.data["system_info"]["system"].get("subsystems", [])
        
        # 如果还没有保存过系统信息，尝试从界面上获取
        if not subsystems and hasattr(self, "subsystem_manager") and self.subsystem_manager:
            subsystems = self.subsystem_manager.get_data()
        
        # 更新缓存
        self._subsystem_cache['_subsystems'] = subsystems
        return subsystems
    
    def get_subsystem_id(self, subsystem_name):
        """获取子系统 ID - 使用缓存避免重复计算
        
        Args:
            subsystem_name: 子系统名称
            
        Returns:
            int: 子系统 ID（从 1 开始），如果不存在返回 -1
        """
        # 检查缓存
        if subsystem_name in self._subsystem_name_to_id:
            return self._subsystem_name_to_id[subsystem_name]
        
        # 获取子系统列表并构建映射
        subsystems = self._get_subsystems()
        for idx, name in enumerate(subsystems):
            self._subsystem_name_to_id[name] = idx + 1  # ID 从 1 开始
        
        # 返回缓存的值
        return self._subsystem_name_to_id.get(subsystem_name, -1)
    
    def invalidate_subsystem_cache(self):
        """使子系统缓存失效 - 当子系统列表发生变化时调用"""
        self._subsystem_cache.clear()
        self._subsystem_name_to_id.clear()
    
    def create_scrollable_canvas(self, parent):
        """创建可滚动画布 - 优化版，避免 bind_all 全局绑定问题
        
        Returns:
            tuple: (canvas, scrollable_frame)
        """
        canvas = tk.Canvas(parent, highlightthickness=0)
        scrollbar = ttk.Scrollbar(parent, orient="vertical", command=canvas.yview)
        scrollable_frame = ttk.Frame(canvas, padding=10)

        scrollable_frame.bind("<Configure>", lambda e: canvas.configure(scrollregion=canvas.bbox("all")))
        canvas.create_window((0, 0), window=scrollable_frame, anchor="nw")
        canvas.configure(yscrollcommand=scrollbar.set)
        
        # 绑定 Enter/Leave 事件来切换活动 Canvas
        canvas.bind("<Enter>", lambda e: self._set_active_canvas(canvas))
        canvas.bind("<Leave>", lambda e: self._clear_active_canvas(canvas))
        
        # 使用统一的滚轮处理方法，替代每个 canvas 单独 bind_all
        canvas.bind("<MouseWheel>", self._on_mouse_wheel)

        canvas.pack(side=LEFT, fill=BOTH, expand=True)
        scrollbar.pack(side=RIGHT, fill=Y)
        
        return canvas, scrollable_frame
    
    def _set_active_canvas(self, canvas):
        """设置当前活动的 Canvas"""
        self.active_canvas = canvas
    
    def _clear_active_canvas(self, canvas):
        """清除活动 Canvas（当鼠标离开时）"""
        if self.active_canvas == canvas:
            self.active_canvas = None

    def create_main_interface(self):
        """创建主界面"""
        # 创建顶部标题栏
        self.create_header()
        
        # 创建 Notebook(选项卡容器)
        self.notebook = ttk.Notebook(self.root, style='TNotebook')
        self.notebook.pack(fill=BOTH, expand=True, padx=15, pady=(0, 15))
        
        # 启用所有选项卡的动画效果
        try:
            self.notebook.enable_swipe_detection()
        except:
            pass

        self.create_system_info_tab()
        self.create_physical_security_tab()
        self.create_network_security_tab()
        self.create_device_security_tab()
        self.create_application_security_tab()
        self.create_export_import_tab()
    
    def create_header(self):
        """创建顶部标题栏"""
        header_frame = ttk.Frame(self.root)
        header_frame.pack(fill=X, padx=15, pady=(15, 5))
        
        # 标题
        title_label = ttk.Label(
            header_frame, 
            text="🔐 商用密码应用安全性评估实施工具", 
            style='Title.TLabel'
        )
        title_label.pack(side=LEFT)
        
        # 版本信息
        version_label = ttk.Label(
            header_frame, 
            text="v2.0 | 现代化 UI 版", 
            style='Normal.TLabel',
            foreground='#666'
        )
        version_label.pack(side=RIGHT, padx=10)

    # ================= 系统基本信息选项卡 =================
    def create_system_info_tab(self):
        tab = ttk.Frame(self.notebook)
        self.notebook.add(tab, text="📋 系统基本信息")

        # 使用优化后的 create_scrollable_canvas 方法
        canvas, scrollable_frame = self.create_scrollable_canvas(tab)

        # 一、项目基本信息
        proj_frame = ttk.LabelFrame(scrollable_frame, text="一、项目基本信息", padding=15)
        proj_frame.pack(fill=X, expand=True, padx=10, pady=10)
        proj_frame.configure(style='Custom.TLabelframe')

        self.proj_flow_id = ttk.Entry(proj_frame, width=50)
        self.proj_flow_id.grid(row=0, column=1, sticky=W + E, pady=5, padx=5)
        ttk.Label(proj_frame, text="流转单编号:").grid(row=0, column=0, sticky=W, pady=5)

        self.proj_sys_name = ttk.Entry(proj_frame, width=50)
        self.proj_sys_name.grid(row=1, column=1, sticky=W + E, pady=5, padx=5)
        ttk.Label(proj_frame, text="信息系统名称:").grid(row=1, column=0, sticky=W, pady=5)

        self.proj_manager = ttk.Entry(proj_frame, width=50)
        self.proj_manager.grid(row=2, column=1, sticky=W + E, pady=5, padx=5)
        ttk.Label(proj_frame, text="系统负责人:").grid(row=2, column=0, sticky=W, pady=5)

        self.proj_contact = ttk.Entry(proj_frame, width=50)
        self.proj_contact.grid(row=3, column=1, sticky=W + E, pady=5, padx=5)
        ttk.Label(proj_frame, text="联系方式:").grid(row=3, column=0, sticky=W, pady=5)

        self.proj_evaluator = ttk.Entry(proj_frame, width=50)
        self.proj_evaluator.grid(row=4, column=1, sticky=W + E, pady=5, padx=5)
        ttk.Label(proj_frame, text="评估人员:").grid(row=4, column=0, sticky=W, pady=5)

        ttk.Label(proj_frame, text="访谈时间:").grid(row=5, column=0, sticky=W, pady=5)
        self.proj_interview_date = create_date_entry(proj_frame, 5, 1, "")

        # 二、系统基本信息
        sys_frame = ttk.LabelFrame(scrollable_frame, text="二、系统基本信息", padding=15)
        sys_frame.pack(fill=X, expand=True, padx=10, pady=10)
        sys_frame.configure(style='Custom.TLabelframe')

        ttk.Label(sys_frame, text="系统业务功能简介 (300 字以内):").grid(row=0, column=0, sticky=NW, pady=5)
        self.sys_desc = scrolledtext.ScrolledText(sys_frame, width=60, height=5)
        self.sys_desc.grid(row=0, column=1, sticky=W + E, pady=5, padx=5)

        # 所含子系统
        ttk.Label(sys_frame, text="所含子系统:").grid(row=1, column=0, sticky=NW, pady=5)
        self.subsystem_container = ttk.Frame(sys_frame)
        self.subsystem_container.grid(row=1, column=1, sticky=W + E, pady=5, padx=5)
        
        # 使用优化后的 SubsystemManager 管理子系统
        self.subsystem_manager = SubsystemManager(self.subsystem_container)

        add_sub_btn = ttk.Button(sys_frame, text="+ 添加子系统", command=self.add_subsystem)
        add_sub_btn.grid(row=2, column=1, sticky=W, pady=5, padx=5)

        # 上线时间
        ttk.Label(sys_frame, text="系统上线时间:").grid(row=3, column=0, sticky=W, pady=5)
        self.sys_online_date = create_date_entry(sys_frame, 3, 1, "")

        # 等保定级情况
        ttk.Label(sys_frame, text="等保定级情况:").grid(row=4, column=0, sticky=W, pady=5)
        self.sys_level_status = ttk.Combobox(
            sys_frame, values=["未定级", "定级中", "已定级"], state="readonly", width=47
        )
        self.sys_level_status.grid(row=4, column=1, sticky=W, pady=5, padx=5)
        self.sys_level_status.bind("<<ComboboxSelected>>", self.on_sys_level_status_change)

        # 动态区域容器
        self.level_detail_frame = ttk.Frame(sys_frame)
        self.level_detail_frame.grid(row=5, column=1, columnspan=1, sticky=W + E, pady=5, padx=5)

        # 三、密码应用情况
        crypto_frame = ttk.LabelFrame(scrollable_frame, text="三、密码应用情况", padding=15)
        crypto_frame.pack(fill=X, expand=True, padx=10, pady=10)
        crypto_frame.configure(style='Custom.TLabelframe')

        # 1. 上次密评情况
        ttk.Label(crypto_frame, text="上次密评情况:").grid(row=0, column=0, sticky=W, pady=5)
        self.crypto_last_status = ttk.Combobox(crypto_frame, values=["未开展", "已开展"], state="readonly", width=47)
        self.crypto_last_status.grid(row=0, column=1, sticky=W, pady=5, padx=5)
        self.crypto_last_status.bind("<<ComboboxSelected>>", self.on_crypto_last_status_change)

        self.crypto_detail_frame = ttk.Frame(crypto_frame)
        self.crypto_detail_frame.grid(row=1, column=1, sticky=W + E, pady=5, padx=5)

        # 2. 密码应用方案
        ttk.Label(crypto_frame, text="密码应用方案:").grid(row=1, column=0, sticky=W, pady=5)
        self.crypto_plan = ttk.Combobox(crypto_frame, values=["无", "有"], state="readonly", width=47)
        self.crypto_plan.grid(row=1, column=1, sticky=W, pady=5, padx=5)
        self.crypto_plan.bind("<<ComboboxSelected>>", self.on_crypto_plan_change)

        self.plan_review_container = ttk.Frame(crypto_frame)
        self.plan_review_container.grid(row=2, column=1, sticky=W + E, pady=5, padx=5)

        # 保存按钮 - 使用强调样式
        save_btn_frame = ttk.Frame(scrollable_frame)
        save_btn_frame.pack(pady=20)
        save_btn = ttk.Button(save_btn_frame, text="💾 保存系统信息", command=self.save_system_info, style='Header.TButton')
        save_btn.pack(ipadx=20, ipady=5)

        # 初始化状态
        self.on_sys_level_status_change(None)
        self.on_crypto_last_status_change(None)
        self.on_crypto_plan_change(None)
        # 初始化一个子系统
        self.subsystem_manager.add_subsystem()

    def add_subsystem(self):
        """添加子系统 - 使用 SubsystemManager"""
        self.subsystem_manager.add_subsystem()

    def remove_subsystem(self, frame_to_remove):
        """移除子系统 - 使用 SubsystemManager"""
        self.subsystem_manager.remove_subsystem(frame_to_remove)

    def on_sys_level_status_change(self, event):
        for w in self.level_detail_frame.winfo_children():
            w.destroy()

        if self.sys_level_status.get() == "已定级":
            # 构建已定级时的详细字段
            row = 0
            ttk.Label(self.level_detail_frame, text="系统等保等级:").grid(row=row, column=0, sticky=W, pady=2)
            self.sys_level_val = ttk.Combobox(
                self.level_detail_frame, values=["二级", "三级", "四级"], state="readonly", width=10
            )
            self.sys_level_val.grid(row=row, column=1, sticky=W, pady=2, padx=5)

            ttk.Label(self.level_detail_frame, text="S_").grid(row=row, column=2, sticky=E, pady=2, padx=(10, 0))
            self.sys_s_val = ttk.Combobox(self.level_detail_frame, values=["1", "2", "3"], state="readonly", width=3)
            self.sys_s_val.grid(row=row, column=3, sticky=W, pady=2, padx=2)

            ttk.Label(self.level_detail_frame, text="A_").grid(row=row, column=4, sticky=E, pady=2, padx=(5, 0))
            self.sys_a_val = ttk.Combobox(self.level_detail_frame, values=["1", "2", "3"], state="readonly", width=3)
            self.sys_a_val.grid(row=row, column=5, sticky=W, pady=2, padx=2)

            row += 1
            ttk.Label(self.level_detail_frame, text="是否与密评等级一致:").grid(row=row, column=0, sticky=W, pady=2)
            self.sys_consistent = ttk.Combobox(
                self.level_detail_frame, values=["一致", "不一致"], state="readonly", width=10
            )
            self.sys_consistent.grid(row=row, column=1, sticky=W, pady=2, padx=5)

            # 等保测评情况
            row += 1
            ttk.Label(self.level_detail_frame, text="等保测评情况:").grid(row=row, column=0, sticky=W, pady=2)
            self.sys_test_status = ttk.Combobox(
                self.level_detail_frame, values=["未开展", "开展中", "已开展"], state="readonly", width=10
            )
            self.sys_test_status.grid(row=row, column=1, sticky=W, pady=2, padx=5)
            self.sys_test_status.bind(
                "<<ComboboxSelected>>", lambda e: self.on_sys_test_status_change(e, self.level_detail_frame, row + 1)
            )

            self.test_detail_container = ttk.Frame(self.level_detail_frame)
            self.test_detail_container.grid(row=row + 1, column=0, columnspan=6, sticky=W + E, pady=5)
            self.on_sys_test_status_change(None, self.level_detail_frame, row + 1)

    def on_sys_test_status_change(self, event, parent, start_row):
        for w in self.test_detail_container.winfo_children():
            w.destroy()

        status = self.sys_test_status.get()
        if status in ["已开展", "开展中"]:
            r = 0
            ttk.Label(self.test_detail_container, text="等保测评机构:").grid(row=r, column=0, sticky=W, pady=2)
            self.test_org = ttk.Entry(self.test_detail_container, width=40)
            self.test_org.grid(row=r, column=1, sticky=W, pady=2, padx=5)

        if status == "已开展":
            r = 1
            ttk.Label(self.test_detail_container, text="等保测评时间:").grid(row=r, column=0, sticky=W, pady=2)
            self.test_date = create_date_entry(self.test_detail_container, r, 1, "")

            r = 2
            ttk.Label(self.test_detail_container, text="等保测评结论:").grid(row=r, column=0, sticky=W, pady=2)
            conc_frame = ttk.Frame(self.test_detail_container)
            conc_frame.grid(row=r, column=1, sticky=W, pady=2, padx=5)
            self.test_conc = ttk.Entry(conc_frame, width=20)
            self.test_conc.pack(side=LEFT)
            ttk.Label(conc_frame, text="符合率:").pack(side=LEFT, padx=5)
            self.test_rate = ttk.Entry(conc_frame, width=10)
            self.test_rate.pack(side=LEFT)

    def on_crypto_last_status_change(self, event):
        for w in self.crypto_detail_frame.winfo_children():
            w.destroy()

        if self.crypto_last_status.get() == "已开展":
            r = 0
            ttk.Label(self.crypto_detail_frame, text="密码测评机构:").grid(row=r, column=0, sticky=W, pady=2)
            self.crypto_org = ttk.Entry(self.crypto_detail_frame, width=40)
            self.crypto_org.grid(row=r, column=1, sticky=W, pady=2, padx=5)

            r = 1
            ttk.Label(self.crypto_detail_frame, text="密码测评时间:").grid(row=r, column=0, sticky=W, pady=2)
            self.crypto_date = create_date_entry(self.crypto_detail_frame, r, 1, "")

            r = 2
            ttk.Label(self.crypto_detail_frame, text="密码测评结论:").grid(row=r, column=0, sticky=W, pady=2)
            conc_frame = ttk.Frame(self.crypto_detail_frame)
            conc_frame.grid(row=r, column=1, sticky=W, pady=2, padx=5)
            self.crypto_conc = ttk.Entry(conc_frame, width=20)
            self.crypto_conc.pack(side=LEFT)
            ttk.Label(conc_frame, text="分数:").pack(side=LEFT, padx=5)
            self.crypto_score = ttk.Entry(conc_frame, width=10)
            self.crypto_score.pack(side=LEFT)

    def on_crypto_plan_change(self, event=None):
        for w in self.plan_review_container.winfo_children():
            w.destroy()

        if self.crypto_plan.get() == "有":
            r = 0
            ttk.Label(self.plan_review_container, text="是否经过评审:").grid(row=r, column=0, sticky=W, pady=2)
            self.plan_reviewed = ttk.Combobox(
                self.plan_review_container, values=["未评审", "已评审"], state="readonly", width=10
            )
            self.plan_reviewed.grid(row=r, column=1, sticky=W, pady=2, padx=5)
            self.plan_reviewed.bind("<<ComboboxSelected>>", lambda e: self.on_plan_reviewed_change(e))

            self.review_detail_container = ttk.Frame(self.plan_review_container)
            self.review_detail_container.grid(row=r + 1, column=0, columnspan=2, sticky=W + E, pady=5)
            self.on_plan_reviewed_change(None)

    def on_plan_reviewed_change(self, event=None):
        for w in self.review_detail_container.winfo_children():
            w.destroy()

        if self.plan_reviewed.get() == "已评审":
            r = 0
            ttk.Label(self.review_detail_container, text="方案评审方式:").grid(row=r, column=0, sticky=W, pady=2)
            self.review_method = ttk.Combobox(
                self.review_detail_container, values=["专家评审", "密评机构评审"], state="readonly", width=15
            )
            self.review_method.grid(row=r, column=1, sticky=W, pady=2, padx=5)
            self.review_method.bind("<<ComboboxSelected>>", self.on_review_method_change)
            self.review_method.bind("<<ComboboxSelected>>", self.on_review_method_change)

            r = 1
            ttk.Label(self.review_detail_container, text="方案评审时间:").grid(row=r, column=0, sticky=W, pady=2)
            self.review_date = create_date_entry(self.review_detail_container, r, 1, "")

            # 方案评审机构输入框（当选择密评机构评审时显示）
            r = 2
            self.review_org_label = ttk.Label(self.review_detail_container, text="方案评审机构:")
            self.review_org_label.grid(row=r, column=0, sticky=W, pady=2)
            self.review_org = ttk.Entry(self.review_detail_container, width=40)
            self.review_org.grid(row=r, column=1, sticky=W, pady=2, padx=5)
            # 初始隐藏，等待选择密评机构评审时显示
            self.review_org_label.grid_remove()
            self.review_org.grid_remove()

    def on_review_method_change(self, event=None):
        """处理方案评审方式变化，当选择密评机构评审时显示机构输入框"""
        # 当选择密评机构评审时，显示方案评审机构输入框
        if self.review_method.get() == "密评机构评审":
            self.review_org_label.grid()
            self.review_org.grid()
        else:
            self.review_org_label.grid_remove()
            self.review_org.grid_remove()

    def save_system_info(self):
        # 收集子系统数据 - 使用 SubsystemManager 的 get_data 方法
        subs = self.subsystem_manager.get_data() if self.subsystem_manager else []

        data = {
            "project": {
                "flow_id": self.proj_flow_id.get(),
                "sys_name": self.proj_sys_name.get(),
                "manager": self.proj_manager.get(),
                "contact": self.proj_contact.get(),
                "evaluator": self.proj_evaluator.get(),
                "interview_date": self.proj_interview_date.get(),
            },
            "system": {
                "desc": self.sys_desc.get("1.0", END),
                "subsystems": subs,
                "online_date": self.sys_online_date.get(),
                "level_status": self.sys_level_status.get(),
            },
            "crypto": {"last_status": self.crypto_last_status.get()},
        }

        if self.sys_level_status.get() == "已定级":
            data["system"]["level"] = getattr(self, "sys_level_val", None) and self.sys_level_val.get()
            data["system"]["s_val"] = getattr(self, "sys_s_val", None) and self.sys_s_val.get()
            data["system"]["a_val"] = getattr(self, "sys_a_val", None) and self.sys_a_val.get()
            data["system"]["consistent"] = getattr(self, "sys_consistent", None) and self.sys_consistent.get()

            if hasattr(self, "sys_test_status"):
                data["system"]["test_status"] = self.sys_test_status.get()
                if self.sys_test_status.get() in ["已开展", "开展中"]:
                    data["system"]["test_org"] = getattr(self, "test_org", None) and self.test_org.get()
                if self.sys_test_status.get() == "已开展":
                    data["system"]["test_date"] = getattr(self, "test_date", None) and self.test_date.get()
                    data["system"]["test_conc"] = getattr(self, "test_conc", None) and self.test_conc.get()
                    data["system"]["test_rate"] = getattr(self, "test_rate", None) and self.test_rate.get()

        if self.crypto_last_status.get() == "已开展":
            data["crypto"]["org"] = getattr(self, "crypto_org", None) and self.crypto_org.get()
            data["crypto"]["date"] = getattr(self, "crypto_date", None) and self.crypto_date.get()
            data["crypto"]["conc"] = getattr(self, "crypto_conc", None) and self.crypto_conc.get()
            data["crypto"]["score"] = getattr(self, "crypto_score", None) and self.crypto_score.get()

            if hasattr(self, "crypto_plan"):
                data["crypto"]["plan"] = self.crypto_plan.get()
                if self.crypto_plan.get() == "有":
                    data["crypto"]["reviewed"] = getattr(self, "plan_reviewed", None) and self.plan_reviewed.get()
                    if getattr(self, "plan_reviewed", None) and self.plan_reviewed.get() == "已评审":
                        data["crypto"]["review_method"] = (
                            getattr(self, "review_method", None) and self.review_method.get()
                        )
                        data["crypto"]["review_date"] = getattr(self, "review_date", None) and self.review_date.get()

        self.data["system_info"] = data
        # 系统信息保存后，使缓存失效以便重新加载
        self.invalidate_subsystem_cache()
        messagebox.showinfo("成功", "系统基本信息已保存！")

    # ================= 物理和环境安全选项卡 =================
    def create_physical_security_tab(self):
        tab = ttk.Frame(self.notebook)
        self.notebook.add(tab, text="🏢 物理和环境安全")

        # 使用优化后的 create_scrollable_canvas 方法
        canvas, scrollable_frame = self.create_scrollable_canvas(tab)

        self.physical_objects_container = ttk.Frame(scrollable_frame)
        self.physical_objects_container.pack(fill=BOTH, expand=True, padx=5, pady=5)

        self.physical_objects = []

        btn_frame = ttk.Frame(scrollable_frame)
        btn_frame.pack(fill=X, padx=5, pady=15)
        ttk.Button(btn_frame, text="➕ 添加测评对象", command=self.add_physical_object).pack(side=LEFT, padx=5)
        ttk.Button(btn_frame, text="💾 保存物理安全记录", command=self.save_physical_security).pack(side=RIGHT, padx=5)

        # 初始化一个对象
        self.add_physical_object()

    def add_physical_object(self):
        idx = len(self.physical_objects) + 1
        obj_frame = ttk.LabelFrame(self.physical_objects_container, text=f"测评对象 {idx}", padding=10)
        obj_frame.pack(fill=BOTH, expand=True, pady=10, padx=5)

        # 顶部操作栏
        top_bar = ttk.Frame(obj_frame)
        top_bar.pack(fill=X, pady=(0, 10))
        ttk.Button(top_bar, text="删除此对象", command=lambda: self.remove_physical_object(obj_frame)).pack(side=RIGHT)

        record = {
            "frame": obj_frame,
            "access_ctrl": self.create_access_control_section(obj_frame),
            "door_integrity": self.create_door_integrity_section(obj_frame),
            "video_integrity": self.create_video_integrity_section(obj_frame),
        }
        self.physical_objects.append(record)
        self.update_physical_object_numbers()

    def remove_physical_object(self, frame_to_remove):
        for item in self.physical_objects:
            if item["frame"] == frame_to_remove:
                item["frame"].destroy()
                self.physical_objects.remove(item)
                break
        self.update_physical_object_numbers()

    def update_physical_object_numbers(self):
        for i, item in enumerate(self.physical_objects):
            item["frame"].config(text=f"测评对象 {i+1}")

    def create_access_control_section(self, parent):
        frame = ttk.LabelFrame(parent, text="一、物理访问身份鉴别测评", padding=5)
        frame.pack(fill=BOTH, expand=True, pady=5)

        # 1. 基本信息
        info_frame = ttk.Frame(frame)
        info_frame.pack(fill=X, pady=5)
        cols = [("被测对象名称:", 0), ("地址:", 2), ("门禁系统厂商及版本:", 4), ("视频监控系统厂商及版本:", 6)]
        entries = {}
        for i, (lbl, c) in enumerate(cols):
            ttk.Label(info_frame, text=lbl).grid(row=0, column=c, sticky=W, padx=5, pady=2)
            e = ttk.Entry(info_frame, width=15)
            e.grid(row=1, column=c, sticky=W + E, padx=5, pady=2)
            entries[lbl] = e

        # 2. 密码技术使用
        tech_frame = ttk.Frame(frame)
        tech_frame.pack(fill=X, pady=5)
        ttk.Label(tech_frame, text="是否使用密码技术:").grid(row=0, column=0, sticky=W, padx=5)
        tech_combo = ttk.Combobox(tech_frame, values=["未使用", "已使用"], state="readonly", width=10)
        tech_combo.grid(row=0, column=1, sticky=W, padx=5)

        detail_frame = ttk.Frame(frame)
        detail_frame.pack(fill=BOTH, expand=True, pady=5)

        def toggle_tech(*args):
            for w in detail_frame.winfo_children():
                w.destroy()
            if tech_combo.get() == "已使用":
                # 3 & 4. 合规性判定
                r = 0
                ttk.Label(detail_frame, text="密码技术合规性:").grid(row=r, column=0, sticky=W, padx=5)
                tech_comp = ttk.Combobox(detail_frame, values=["不合规", "合规"], state="readonly", width=10)
                tech_comp.grid(row=r, column=1, sticky=W, padx=5)

                ttk.Label(detail_frame, text="密码产品合规性:").grid(row=r, column=2, sticky=W, padx=10)
                prod_comp = ttk.Combobox(detail_frame, values=["不合规", "合规"], state="readonly", width=10)
                prod_comp.grid(row=r, column=3, sticky=W, padx=5)

                # 6. 算法输入
                r = 1
                ttk.Label(detail_frame, text="实现算法:").grid(row=r, column=0, sticky=W, padx=5)
                algo_entry = ttk.Entry(detail_frame, width=40)
                algo_entry.grid(row=r, column=1, columnspan=3, sticky=W + E, padx=5)

                # 7. 四防判定
                r = 2
                checks = ["专人值守", "进出登记", "专人陪同", "实时监控"]
                check_vars = {}
                for i, txt in enumerate(checks):
                    v = tk.BooleanVar()
                    cb = ttk.Checkbutton(detail_frame, text=f"具备{txt}", variable=v)
                    cb.grid(row=r, column=i, sticky=W, padx=10)
                    check_vars[txt] = v

                # 5. 密码产品管理 (仅当产品合规时显示)
                prod_list_frame = ttk.LabelFrame(detail_frame, text="密码产品列表", padding=5)
                prod_list_frame.grid(row=3, column=0, columnspan=4, sticky=W + E, pady=10)

                prod_container = ttk.Frame(prod_list_frame)
                prod_container.pack(fill=BOTH, expand=True)
                prod_entries = []

                def add_prod():
                    pf = ttk.Frame(prod_container)
                    # 使用 pack 布局来排列产品字段，在输入框前增加标签说明
                    pf.pack(fill=X, pady=2)

                    # 产品名称
                    ttk.Label(pf, text="产品名称:").pack(side=LEFT, padx=(0, 2))
                    e_name = ttk.Entry(pf, width=10)
                    e_name.pack(side=LEFT, padx=2)

                    # 厂商
                    ttk.Label(pf, text="厂商:").pack(side=LEFT, padx=(10, 2))
                    e_vendor = ttk.Entry(pf, width=10)
                    e_vendor.pack(side=LEFT, padx=2)

                    # 证书编号
                    ttk.Label(pf, text="证书编号:").pack(side=LEFT, padx=(10, 2))
                    e_cert = ttk.Entry(pf, width=10)
                    e_cert.pack(side=LEFT, padx=2)

                    # 认证等级
                    ttk.Label(pf, text="认证等级:").pack(side=LEFT, padx=(10, 2))
                    e_level = ttk.Entry(pf, width=8)
                    e_level.pack(side=LEFT, padx=2)

                    # 使用用途
                    ttk.Label(pf, text="使用用途:").pack(side=LEFT, padx=(10, 2))
                    e_purpose = ttk.Entry(pf, width=10)
                    e_purpose.pack(side=LEFT, padx=2)

                    db = ttk.Button(pf, text="×", command=lambda: pf.destroy())
                    db.pack(side=LEFT, padx=5)
                    prod_entries.append(
                        {
                            "产品名称": e_name,
                            "厂商": e_vendor,
                            "证书编号": e_cert,
                            "认证等级": e_level,
                            "用途": e_purpose,
                        }
                    )

                def get_prods():
                    return [
                        {k: v.get() for k, v in p.items()} for p in prod_entries if p.get("产品名称", {}).get() != ""
                    ]

                ttk.Button(prod_list_frame, text="+ 添加产品", command=add_prod).pack(pady=5)

                def toggle_prod(*args):
                    if prod_comp.get() == "合规":
                        prod_container.pack(fill=BOTH, expand=True)
                    else:
                        prod_container.pack_forget()

                prod_comp.bind("<<ComboboxSelected>>", toggle_prod)
                # 初始检查
                if prod_comp.get() == "合规":
                    prod_container.pack(fill=BOTH, expand=True)

        tech_combo.bind("<<ComboboxSelected>>", toggle_tech)

        return {
            "entries": entries,
            "tech_combo": tech_combo,
            "detail_frame": detail_frame,  # 用于重建
            "toggle_func": toggle_tech,  # 保存引用以便初始化
        }

    def create_door_integrity_section(self, parent):
        frame = ttk.LabelFrame(parent, text="二、门禁记录完整性测评", padding=5)
        frame.pack(fill=BOTH, expand=True, pady=5)

        impl_frame = ttk.Frame(frame)
        impl_frame.pack(fill=X, pady=5)
        ttk.Label(impl_frame, text="门禁记录存储完整性:").grid(row=0, column=0, sticky=W, padx=5)
        impl_combo = ttk.Combobox(impl_frame, values=["未实现", "已实现"], state="readonly", width=10)
        impl_combo.grid(row=0, column=1, sticky=W, padx=5)

        detail_frame = ttk.Frame(frame)
        detail_frame.pack(fill=BOTH, expand=True, pady=5)

        prod_container = None
        prod_entries = []

        def toggle_impl(*args):
            nonlocal prod_container
            for w in detail_frame.winfo_children():
                w.destroy()
            if impl_combo.get() == "已实现":
                r = 0
                ttk.Label(detail_frame, text="密码技术合规性:").grid(row=r, column=0, sticky=W, padx=5)
                tech_comp = ttk.Combobox(detail_frame, values=["不合规", "合规"], state="readonly", width=10)
                tech_comp.grid(row=r, column=1, sticky=W, padx=5)

                ttk.Label(detail_frame, text="密码产品合规性:").grid(row=r, column=2, sticky=W, padx=10)
                prod_comp = ttk.Combobox(detail_frame, values=["不合规", "合规"], state="readonly", width=10)
                prod_comp.grid(row=r, column=3, sticky=W, padx=5)

                prod_list_frame = ttk.LabelFrame(detail_frame, text="密码产品列表", padding=5)
                prod_list_frame.grid(row=1, column=0, columnspan=4, sticky=W + E, pady=10)

                prod_container = ttk.Frame(prod_list_frame)

                def add_prod():
                    pf = ttk.Frame(prod_container)
                    pf.pack(fill=X, pady=2)
                    fields = ["产品名称", "厂商", "证书编号", "认证等级", "用途"]
                    ents = {}
                    for f in fields:
                        ttk.Label(pf, text=f + ":").pack(side=LEFT, padx=2)
                        e = ttk.Entry(pf, width=10)
                        e.pack(side=LEFT, padx=2)
                        ents[f] = e
                    db = ttk.Button(pf, text="×", command=lambda: pf.destroy())
                    db.pack(side=LEFT, padx=5)
                    prod_entries.append(ents)

                def check_prod(*args):
                    if prod_container:
                        prod_container.pack_forget()
                    if prod_comp.get() == "合规":
                        prod_container.pack(fill=BOTH, expand=True)
                        ttk.Button(prod_list_frame, text="+ 添加产品", command=add_prod).pack(pady=5)

                prod_comp.bind("<<ComboboxSelected>>", check_prod)
                # Init check
                if prod_comp.get() == "合规":
                    prod_container.pack(fill=BOTH, expand=True)
                    ttk.Button(prod_list_frame, text="+ 添加产品", command=add_prod).pack(pady=5)

        impl_combo.bind("<<ComboboxSelected>>", toggle_impl)
        return {"impl_combo": impl_combo, "detail_frame": detail_frame}

    def create_video_integrity_section(self, parent):
        frame = ttk.LabelFrame(parent, text="三、视频监控记录存储完整性测评", padding=5)
        frame.pack(fill=BOTH, expand=True, pady=5)

        impl_frame = ttk.Frame(frame)
        impl_frame.pack(fill=X, pady=5)
        ttk.Label(impl_frame, text="视频监控记录存储完整性:").grid(row=0, column=0, sticky=W, padx=5)
        impl_combo = ttk.Combobox(impl_frame, values=["未实现", "已实现"], state="readonly", width=10)
        impl_combo.grid(row=0, column=1, sticky=W, padx=5)

        detail_frame = ttk.Frame(frame)
        detail_frame.pack(fill=BOTH, expand=True, pady=5)

        prod_container = None
        prod_entries = []

        def toggle_impl(*args):
            nonlocal prod_container
            for w in detail_frame.winfo_children():
                w.destroy()
            if impl_combo.get() == "已实现":
                r = 0
                ttk.Label(detail_frame, text="密码技术合规性:").grid(row=r, column=0, sticky=W, padx=5)
                tech_comp = ttk.Combobox(detail_frame, values=["不合规", "合规"], state="readonly", width=10)
                tech_comp.grid(row=r, column=1, sticky=W, padx=5)

                ttk.Label(detail_frame, text="密码产品合规性:").grid(row=r, column=2, sticky=W, padx=10)
                prod_comp = ttk.Combobox(detail_frame, values=["不合规", "合规"], state="readonly", width=10)
                prod_comp.grid(row=r, column=3, sticky=W, padx=5)

                prod_list_frame = ttk.LabelFrame(detail_frame, text="密码产品列表", padding=5)
                prod_list_frame.grid(row=1, column=0, columnspan=4, sticky=W + E, pady=10)

                prod_container = ttk.Frame(prod_list_frame)

                def add_prod():
                    pf = ttk.Frame(prod_container)
                    pf.pack(fill=X, pady=2)
                    fields = ["产品名称", "厂商", "证书编号", "认证等级", "用途"]
                    ents = {}
                    for f in fields:
                        ttk.Label(pf, text=f + ":").pack(side=LEFT, padx=2)
                        e = ttk.Entry(pf, width=10)
                        e.pack(side=LEFT, padx=2)
                        ents[f] = e
                    db = ttk.Button(pf, text="×", command=lambda: pf.destroy())
                    db.pack(side=LEFT, padx=5)
                    prod_entries.append(ents)

                def check_prod(*args):
                    if prod_container:
                        prod_container.pack_forget()
                    if prod_comp.get() == "合规":
                        prod_container.pack(fill=BOTH, expand=True)
                        ttk.Button(prod_list_frame, text="+ 添加产品", command=add_prod).pack(pady=5)

                prod_comp.bind("<<ComboboxSelected>>", check_prod)
                if prod_comp.get() == "合规":
                    prod_container.pack(fill=BOTH, expand=True)
                    ttk.Button(prod_list_frame, text="+ 添加产品", command=add_prod).pack(pady=5)

        impl_combo.bind("<<ComboboxSelected>>", toggle_impl)
        return {"impl_combo": impl_combo, "detail_frame": detail_frame}

    def save_physical_security(self):
        records = []
        for obj in self.physical_objects:
            # 这里需要编写详细的提取逻辑，为节省篇幅略去具体实现，结构同前
            # 实际使用时需遍历所有 entry 和 combo 获取值
            records.append({"status": "saved"})
        self.data["physical_security"] = records
        messagebox.showinfo("成功", "物理和环境安全测评记录已保存！")

    # ================= 其他选项卡 (网络、设备、应用、导入导出) =================
    # 为保持代码简洁，以下选项卡暂时保留基础框架，逻辑同物理安全类似

    def create_network_security_tab(self):
        """创建网络和通信安全测评选项卡"""
        tab = ttk.Frame(self.notebook)
        self.notebook.add(tab, text="🌐 网络和通信安全")

        # 使用优化后的 create_scrollable_canvas 方法
        canvas, scrollable_frame = self.create_scrollable_canvas(tab)

        # 初始化网络通信安全数据存储
        if "network_security" not in self.data or isinstance(self.data["network_security"], list):
            self.data["network_security"] = {}

        # 获取子系统列表
        self.network_subsystem_container = ttk.LabelFrame(scrollable_frame, text="子系统选择", padding=15)
        self.network_subsystem_container.pack(fill=X, padx=10, pady=10)
        self.network_subsystem_container.configure(style='Custom.TLabelframe')

        self.network_subsystem_vars = {}
        self.network_subsystem_frames = {}

        # 刷新子系统列表按钮
        ttk.Button(
            self.network_subsystem_container,
            text="刷新子系统列表",
            command=lambda: self.refresh_network_subsystems(scrollable_frame),
        ).pack(pady=5)

        self.network_subsystems_loaded = False

        # 保存按钮
        save_btn = ttk.Button(
            scrollable_frame, text="保存网络和通信安全数据", command=lambda: self.save_network_security_data()
        )
        save_btn.pack(pady=10)

    def refresh_network_subsystems(self, parent=None):
        """刷新子系统列表并创建对应的测评区域 - 优化版"""
        # 清除旧的子系统框架（除了容器本身）
        for frame in list(self.network_subsystem_frames.values()):
            frame.destroy()
        self.network_subsystem_frames.clear()
        self.network_subsystem_vars.clear()

        # 使用缓存的子系统列表，避免重复计算
        subsystems = self._get_subsystems()

        if not subsystems:
            messagebox.showwarning("提示", "请先在系统基本信息中添加子系统！")
            return

        # 为每个子系统创建测评区域
        for idx, subsystem_name in enumerate(subsystems):
            self.create_subsystem_network_section(parent, subsystem_name, idx)

        self.network_subsystems_loaded = True

    def create_subsystem_network_section(self, parent, subsystem_name, index):
        """为单个子系统创建网络和通信安全测评区域"""
        # 创建子系统主框架
        subsystem_frame = ttk.LabelFrame(parent, text=f"子系统：{subsystem_name}", padding=10)
        subsystem_frame.pack(fill=BOTH, expand=True, padx=10, pady=5)
        self.network_subsystem_frames[subsystem_name] = subsystem_frame

        # 一、客户端与系统之间
        client_server_frame = ttk.LabelFrame(subsystem_frame, text="一、客户端与系统之间", padding=10)
        client_server_frame.pack(fill=BOTH, expand=True, padx=5, pady=5)

        # 添加通道按钮
        btn_frame = ttk.Frame(client_server_frame)
        btn_frame.pack(fill=X, pady=5)
        ttk.Button(
            btn_frame,
            text="+ 添加通信信道",
            command=lambda: self.add_client_server_channel(client_server_frame, subsystem_name),
        ).pack(side=LEFT)

        # 存储引用
        if not hasattr(self, "client_server_channels"):
            self.client_server_channels = {}
        if subsystem_name not in self.client_server_channels:
            self.client_server_channels[subsystem_name] = []

        # 二、系统与系统之间
        system_system_frame = ttk.LabelFrame(subsystem_frame, text="二、系统与系统之间", padding=10)
        system_system_frame.pack(fill=BOTH, expand=True, padx=5, pady=5)

        # 添加通道按钮
        btn_frame2 = ttk.Frame(system_system_frame)
        btn_frame2.pack(fill=X, pady=5)
        ttk.Button(
            btn_frame2,
            text="+ 添加通信信道",
            command=lambda: self.add_system_system_channel(system_system_frame, subsystem_name),
        ).pack(side=LEFT)

        # 存储引用
        if not hasattr(self, "system_system_channels"):
            self.system_system_channels = {}
        if subsystem_name not in self.system_system_channels:
            self.system_system_channels[subsystem_name] = []

    def add_client_server_channel(self, parent, subsystem_name):
        """添加客户端与系统之间的通信信道"""
        index = len(self.client_server_channels.get(subsystem_name, [])) + 1
        channel_frame = ttk.LabelFrame(parent, text=f"通信信道 {index}", padding=10)
        channel_frame.pack(fill=BOTH, expand=True, pady=5)

        channel_data = self.create_channel_form(channel_frame, "client_server", subsystem_name, index)

        if subsystem_name not in self.client_server_channels:
            self.client_server_channels[subsystem_name] = []
        self.client_server_channels[subsystem_name].append(channel_data)

    def add_system_system_channel(self, parent, subsystem_name):
        """添加系统与系统之间的通信信道"""
        index = len(self.system_system_channels.get(subsystem_name, [])) + 1
        channel_frame = ttk.LabelFrame(parent, text=f"通信信道 {index}", padding=10)
        channel_frame.pack(fill=BOTH, expand=True, pady=5)

        channel_data = self.create_channel_form(channel_frame, "system_system", subsystem_name, index)

        if subsystem_name not in self.system_system_channels:
            self.system_system_channels[subsystem_name] = []
        self.system_system_channels[subsystem_name].append(channel_data)

    def create_channel_form(self, parent, channel_type, subsystem_name, index):
        """创建通信信道表单（通用）"""
        row = 0

        # 1. 通信信道名称
        ttk.Label(parent, text="通信信道名称:").grid(row=row, column=0, sticky=W, pady=5)
        name_entry = ttk.Entry(parent, width=50)
        name_entry.grid(row=row, column=1, sticky=W + E, pady=5, padx=5)
        row += 1

        # 2. 网络环境
        ttk.Label(parent, text="网络环境:").grid(row=row, column=0, sticky=W, pady=5)
        network_env_var = tk.StringVar(value="互联网")
        network_env_combo = ttk.Combobox(
            parent,
            textvariable=network_env_var,
            values=["互联网", "办公网", "生产网", "政务外网", "政务内网", "其他"],
            state="readonly",
            width=47,
        )
        network_env_combo.grid(row=row, column=1, sticky=W, pady=5)
        network_env_other_entry = ttk.Entry(parent, width=30)
        network_env_other_entry.grid(row=row, column=2, sticky=W, pady=5, padx=5)
        network_env_other_entry.grid_remove()  # 初始隐藏

        def toggle_network_env(e=None):
            if network_env_var.get() == "其他":
                network_env_other_entry.grid()
            else:
                network_env_other_entry.grid_remove()

        network_env_combo.bind("<<ComboboxSelected>>", toggle_network_env)
        row += 1

        # 根据通道类型显示不同字段
        if channel_type == "client_server":
            # 3. 客户端形态（仅客户端与系统之间）
            ttk.Label(parent, text="客户端形态:").grid(row=row, column=0, sticky=W, pady=5)
            client_type_var = tk.StringVar(value="浏览器")
            client_type_combo = ttk.Combobox(
                parent,
                textvariable=client_type_var,
                values=["浏览器", "PC 客户端", "APP 客户端", "H5", "小程序", "其他"],
                state="readonly",
                width=47,
            )
            client_type_combo.grid(row=row, column=1, sticky=W, pady=5)
            client_type_other_entry = ttk.Entry(parent, width=30)
            client_type_other_entry.grid(row=row, column=2, sticky=W, pady=5, padx=5)
            client_type_other_entry.grid_remove()

            def toggle_client_type(e=None):
                if client_type_var.get() == "其他":
                    client_type_other_entry.grid()
                else:
                    client_type_other_entry.grid_remove()

            client_type_combo.bind("<<ComboboxSelected>>", toggle_client_type)
            row += 1

            # 4. 服务端形态
            ttk.Label(parent, text="服务端形态:").grid(row=row, column=0, sticky=W, pady=5)
            server_type_var = tk.StringVar(value="SSL 网关")
            server_type_combo = ttk.Combobox(
                parent,
                textvariable=server_type_var,
                values=["SSL 网关", "IPsec 网关", "F5", "Nginx", "其他"],
                state="readonly",
                width=47,
            )
            server_type_combo.grid(row=row, column=1, sticky=W, pady=5)
            server_type_other_entry = ttk.Entry(parent, width=30)
            server_type_other_entry.grid(row=row, column=2, sticky=W, pady=5, padx=5)
            server_type_other_entry.grid_remove()

            def toggle_server_type(e=None):
                if server_type_var.get() == "其他":
                    server_type_other_entry.grid()
                else:
                    server_type_other_entry.grid_remove()

            server_type_combo.bind("<<ComboboxSelected>>", toggle_server_type)
            row += 1

        elif channel_type == "system_system":
            # 3. 通信链路形式（仅系统与系统之间）
            ttk.Label(parent, text="通信链路形式:").grid(row=row, column=0, sticky=W, pady=5)
            link_type_var = tk.StringVar(value="裸光纤")
            link_type_combo = ttk.Combobox(
                parent, textvariable=link_type_var, values=["裸光纤", "逻辑专线", "其他"], state="readonly", width=47
            )
            link_type_combo.grid(row=row, column=1, sticky=W, pady=5)
            link_type_other_entry = ttk.Entry(parent, width=30)
            link_type_other_entry.grid(row=row, column=2, sticky=W, pady=5, padx=5)
            link_type_other_entry.grid_remove()

            def toggle_link_type(e=None):
                if link_type_var.get() == "其他":
                    link_type_other_entry.grid()
                else:
                    link_type_other_entry.grid_remove()

            link_type_combo.bind("<<ComboboxSelected>>", toggle_link_type)
            row += 1

            # 4. 被测方通信协议载体（仅系统与系统之间）
            ttk.Label(parent, text="被测方通信协议载体:").grid(row=row, column=0, sticky=W, pady=5)
            carrier_var = tk.StringVar(value="SSL 网关")
            carrier_combo = ttk.Combobox(
                parent,
                textvariable=carrier_var,
                values=["SSL 网关", "IPsec 网关", "F5", "Nginx", "其他"],
                state="readonly",
                width=47,
            )
            carrier_combo.grid(row=row, column=1, sticky=W, pady=5)
            carrier_other_entry = ttk.Entry(parent, width=30)
            carrier_other_entry.grid(row=row, column=2, sticky=W, pady=5, padx=5)
            carrier_other_entry.grid_remove()

            def toggle_carrier(e=None):
                if carrier_var.get() == "其他":
                    carrier_other_entry.grid()
                else:
                    carrier_other_entry.grid_remove()

            carrier_combo.bind("<<ComboboxSelected>>", toggle_carrier)
            row += 1

        # 5. 通信协议
        ttk.Label(parent, text="通信协议:").grid(row=row, column=0, sticky=W, pady=5)
        protocol_var = tk.StringVar(value="HTTP")
        protocol_combo = ttk.Combobox(
            parent,
            textvariable=protocol_var,
            values=["HTTP", "TLS1.0", "TLS1.1", "TLS1.2", "TLS1.3", "TLCP", "FTP", "SFTP", "MQ", "其他"],
            state="readonly",
            width=47,
        )
        protocol_combo.grid(row=row, column=1, sticky=W, pady=5)
        protocol_other_entry = ttk.Entry(parent, width=30)
        protocol_other_entry.grid(row=row, column=2, sticky=W, pady=5, padx=5)
        protocol_other_entry.grid_remove()

        def toggle_protocol(e=None):
            if protocol_var.get() == "其他":
                protocol_other_entry.grid()
            else:
                protocol_other_entry.grid_remove()
            # 处理证书相关字段的显示
            toggle_cert_fields()

        protocol_combo.bind("<<ComboboxSelected>>", toggle_protocol)
        row += 1

        # 国际密码套件和证书区域（TLS1.0-1.3）
        tls_cert_frame = ttk.LabelFrame(parent, text="国际密码套件及证书", padding=10)

        # 6. 国际密码套件
        ttk.Label(tls_cert_frame, text="国际密码套件:").grid(row=0, column=0, sticky=W, pady=5)
        intl_suite_entry = ttk.Entry(tls_cert_frame, width=50)
        intl_suite_entry.grid(row=0, column=1, sticky=W + E, pady=5, padx=5)

        # 7. 国际数字证书
        cert_frame = ttk.LabelFrame(tls_cert_frame, text="国际数字证书", padding=5)
        cert_frame.grid(row=1, column=0, columnspan=2, sticky=W + E, pady=5)

        cert_fields = {}
        cert_labels = ["数字证书算法", "密钥长度", "使用者", "颁发者", "起始日期", "截止日期"]
        for i, label in enumerate(cert_labels):
            ttk.Label(cert_frame, text=f"{label}:").grid(row=i // 3, column=(i % 3) * 2, sticky=W, pady=3, padx=5)
            entry = ttk.Entry(cert_frame, width=15)
            entry.grid(row=i // 3, column=(i % 3) * 2 + 1, sticky=W, pady=3, padx=5)
            cert_fields[label] = entry

        # 密钥用途
        ttk.Label(cert_frame, text="密钥用途:").grid(row=2, column=0, sticky=W, pady=3, padx=5)
        key_usage_frame = ttk.Frame(cert_frame)
        key_usage_frame.grid(row=2, column=1, sticky=W, pady=3)

        key_usage_vars = {}
        for usage in ["Digital Signature", "Key Encipherment", "Data Encipherment", "Key Agreement"]:
            var = tk.BooleanVar(value=False)
            chk = ttk.Checkbutton(key_usage_frame, text=usage, variable=var)
            chk.pack(side=LEFT, padx=5)
            key_usage_vars[usage] = var

        row_in_parent = row

        def toggle_cert_fields():
            proto = protocol_var.get()
            if proto in ["TLS1.0", "TLS1.1", "TLS1.2", "TLS1.3"]:
                tls_cert_frame.grid(row=row_in_parent, column=0, columnspan=3, sticky=W + E, pady=5)
                tlcp_cert_frame.grid_remove()
            elif proto == "TLCP":
                tls_cert_frame.grid_remove()
                tlcp_cert_frame.grid(row=row_in_parent, column=0, columnspan=3, sticky=W + E, pady=5)
            else:
                tls_cert_frame.grid_remove()
                tlcp_cert_frame.grid_remove()

        tls_cert_frame.grid_remove()
        row += 1

        # 国密密码套件和证书区域（TLCP）
        tlcp_cert_frame = ttk.LabelFrame(parent, text="国密密码套件及证书", padding=10)

        # 8. 国密密码套件
        ttk.Label(tlcp_cert_frame, text="国密密码套件:").grid(row=0, column=0, sticky=W, pady=5)
        sm_suite_entry = ttk.Entry(tlcp_cert_frame, width=50)
        sm_suite_entry.grid(row=0, column=1, sticky=W + E, pady=5, padx=5)

        # 9. 国密签名证书
        sign_cert_frame = ttk.LabelFrame(tlcp_cert_frame, text="国密签名证书", padding=5)
        sign_cert_frame.grid(row=1, column=0, columnspan=2, sticky=W + E, pady=5)

        sign_cert_fields = {}
        for i, label in enumerate(cert_labels[:6]):  # 不含密钥用途
            ttk.Label(sign_cert_frame, text=f"{label}:").grid(row=i // 3, column=(i % 3) * 2, sticky=W, pady=3, padx=5)
            entry = ttk.Entry(sign_cert_frame, width=15)
            entry.grid(row=i // 3, column=(i % 3) * 2 + 1, sticky=W, pady=3, padx=5)
            sign_cert_fields[label] = entry

        # 10. 国密加密证书
        enc_cert_frame = ttk.LabelFrame(tlcp_cert_frame, text="国密加密证书", padding=5)
        enc_cert_frame.grid(row=2, column=0, columnspan=2, sticky=W + E, pady=5)

        enc_cert_fields = {}
        for i, label in enumerate(cert_labels[:6]):
            ttk.Label(enc_cert_frame, text=f"{label}:").grid(row=i // 3, column=(i % 3) * 2, sticky=W, pady=3, padx=5)
            entry = ttk.Entry(enc_cert_frame, width=15)
            entry.grid(row=i // 3, column=(i % 3) * 2 + 1, sticky=W, pady=3, padx=5)
            enc_cert_fields[label] = entry

        # 11. 签名、加密证书是否相同
        ttk.Label(tlcp_cert_frame, text="签名、加密证书是否相同:").grid(row=3, column=0, sticky=W, pady=5)
        same_cert_var = tk.StringVar(value="相同")
        same_cert_combo = ttk.Combobox(
            tlcp_cert_frame, textvariable=same_cert_var, values=["相同", "不同"], state="readonly", width=10
        )
        same_cert_combo.grid(row=3, column=1, sticky=W, pady=5)

        def toggle_same_cert(e=None):
            if same_cert_var.get() == "相同":
                enc_cert_frame.grid_remove()
            else:
                enc_cert_frame.grid()

        same_cert_combo.bind("<<ComboboxSelected>>", toggle_same_cert)

        tlcp_cert_frame.grid_remove()
        row += 1

        # 12. 密码产品管理
        crypto_container = ttk.Frame(parent)
        crypto_container.grid(row=row, column=0, columnspan=3, sticky=W + E, pady=5)

        ttk.Label(crypto_container, text="密码产品:").pack(anchor=W)
        crypto_list_frame = ttk.Frame(crypto_container)
        crypto_list_frame.pack(fill=BOTH, expand=True)

        def add_crypto_product():
            cf = ttk.LabelFrame(crypto_list_frame, text="密码产品", padding=5)
            cf.pack(fill=X, pady=2)

            inner = ttk.Frame(cf)
            inner.pack(fill=X)

            ttk.Label(inner, text="产品名称:").pack(side=LEFT)
            pn = ttk.Entry(inner, width=15)
            pn.pack(side=LEFT, padx=5)

            ttk.Label(inner, text="厂商:").pack(side=LEFT, padx=(10, 0))
            vm = ttk.Entry(inner, width=15)
            vm.pack(side=LEFT, padx=5)

            ttk.Label(inner, text="证书编号:").pack(side=LEFT, padx=(10, 0))
            cn = ttk.Entry(inner, width=15)
            cn.pack(side=LEFT, padx=5)

            ttk.Label(inner, text="认证等级:").pack(side=LEFT, padx=(10, 0))
            cl = ttk.Entry(inner, width=10)
            cl.pack(side=LEFT, padx=5)

            ttk.Label(inner, text="使用用途:").pack(side=LEFT, padx=(10, 0))
            pu = ttk.Entry(inner, width=15)
            pu.pack(side=LEFT, padx=5)

            ttk.Button(inner, text="删除", command=cf.destroy).pack(side=LEFT, padx=10)

        ttk.Button(crypto_container, text="+ 添加密码产品", command=add_crypto_product).pack(anchor=W, pady=5)
        row += 1

        # 删除通道按钮
        ttk.Button(parent, text="删除此通信信道", command=parent.destroy).grid(row=row, column=1, sticky=W, pady=10)

        # 返回通道数据引用
        return {
            "frame": parent,
            "name": name_entry,
            "network_env": network_env_combo,
            "network_env_other": network_env_other_entry,
            "channel_type": channel_type,
            "subsystem": subsystem_name,
            "protocol": protocol_combo,
            "protocol_other": protocol_other_entry,
            "intl_suite": intl_suite_entry,
            "cert_fields": cert_fields,
            "key_usage_vars": key_usage_vars,
            "sm_suite": sm_suite_entry,
            "sign_cert_fields": sign_cert_fields,
            "enc_cert_fields": enc_cert_fields,
            "same_cert": same_cert_combo,
            "crypto_container": crypto_list_frame,
            "tls_cert_frame": tls_cert_frame,
            "tlcp_cert_frame": tlcp_cert_frame,
            # 客户端与系统之间特有
            "client_type": client_type_combo if channel_type == "client_server" else None,
            "client_type_other": client_type_other_entry if channel_type == "client_server" else None,
            "server_type": server_type_combo if channel_type == "client_server" else None,
            "server_type_other": server_type_other_entry if channel_type == "client_server" else None,
            # 系统与系统之间特有
            "link_type": link_type_combo if channel_type == "system_system" else None,
            "link_type_other": link_type_other_entry if channel_type == "system_system" else None,
            "carrier": carrier_combo if channel_type == "system_system" else None,
            "carrier_other": carrier_other_entry if channel_type == "system_system" else None,
        }

    def save_network_security_data(self):
        """保存网络和通信安全数据 - 优化版"""
        if not self.network_subsystems_loaded:
            messagebox.showwarning("提示", "请先刷新子系统列表！")
            return

        # 使用 defaultdict 简化数据结构初始化
        network_data = defaultdict(lambda: {"client_server_channels": [], "system_system_channels": []})

        # 收集所有子系统的数据
        for subsystem_name in self.client_server_channels.keys():
            # 保存客户端与系统之间的通道
            if subsystem_name in self.client_server_channels:
                for channel in self.client_server_channels[subsystem_name]:
                    channel_data = self.collect_channel_data(channel, "client_server")
                    if channel_data:
                        network_data[subsystem_name]["client_server_channels"].append(channel_data)

            # 保存系统与系统之间的通道
            if subsystem_name in self.system_system_channels:
                for channel in self.system_system_channels[subsystem_name]:
                    channel_data = self.collect_channel_data(channel, "system_system")
                    if channel_data:
                        network_data[subsystem_name]["system_system_channels"].append(channel_data)

        self.data["network_security"] = dict(network_data)
        # 使缓存失效，因为数据已更新
        self.invalidate_subsystem_cache()
        messagebox.showinfo("成功", "网络和通信安全数据保存成功！")

    def collect_channel_data(self, channel, channel_type):
        """收集单个通道的数据"""
        # 检查通道框架是否还存在（可能已被删除）
        if not channel["frame"].winfo_exists():
            return None

        data = {
            "name": channel["name"].get(),
            "network_env": channel["network_env"].get(),
            "network_env_other": channel["network_env_other"].get(),
            "protocol": channel["protocol"].get(),
            "protocol_other": channel["protocol_other"].get(),
        }

        if channel_type == "client_server":
            data["client_type"] = channel["client_type"].get() if channel["client_type"] else ""
            data["client_type_other"] = channel["client_type_other"].get() if channel["client_type_other"] else ""
            data["server_type"] = channel["server_type"].get() if channel["server_type"] else ""
            data["server_type_other"] = channel["server_type_other"].get() if channel["server_type_other"] else ""
        elif channel_type == "system_system":
            data["link_type"] = channel["link_type"].get() if channel["link_type"] else ""
            data["link_type_other"] = channel["link_type_other"].get() if channel["link_type_other"] else ""
            data["carrier"] = channel["carrier"].get() if channel["carrier"] else ""
            data["carrier_other"] = channel["carrier_other"].get() if channel["carrier_other"] else ""

        # 国际证书数据
        protocol = channel["protocol"].get()
        if protocol in ["TLS1.0", "TLS1.1", "TLS1.2", "TLS1.3"]:
            data["intl_suite"] = channel["intl_suite"].get()
            cert_data = {}
            for label, entry in channel["cert_fields"].items():
                cert_data[label] = entry.get()
            key_usages = [usage for usage, var in channel["key_usage_vars"].items() if var.get()]
            cert_data["key_usages"] = key_usages
            data["intl_cert"] = cert_data
        elif protocol == "TLCP":
            data["sm_suite"] = channel["sm_suite"].get()
            data["same_cert"] = channel["same_cert"].get()

            sign_cert_data = {}
            for label, entry in channel["sign_cert_fields"].items():
                sign_cert_data[label] = entry.get()
            data["sign_cert"] = sign_cert_data

            if channel["same_cert"].get() == "不同":
                enc_cert_data = {}
                for label, entry in channel["enc_cert_fields"].items():
                    enc_cert_data[label] = entry.get()
                data["enc_cert"] = enc_cert_data

        # 密码产品
        crypto_products = []
        for cf in channel["crypto_container"].winfo_children():
            if isinstance(cf, ttk.LabelFrame):
                entries = []
                for w in cf.winfo_children():
                    if isinstance(w, ttk.Frame):
                        for c in w.winfo_children():
                            if isinstance(c, ttk.Entry):
                                entries.append(c.get())
                if len(entries) >= 5:
                    crypto_products.append(
                        {
                            "name": entries[0],
                            "vendor": entries[1],
                            "cert": entries[2],
                            "level": entries[3],
                            "purpose": entries[4],
                        }
                    )
        data["crypto_products"] = crypto_products

        return data

    def create_device_security_tab(self):
        """创建设备和计算安全测评选项卡"""
        tab = ttk.Frame(self.notebook)
        self.notebook.add(tab, text="🖥️ 设备和计算安全")

        # 使用优化后的 create_scrollable_canvas 方法
        canvas, scrollable_frame = self.create_scrollable_canvas(tab)

        # 初始化数据存储
        if (
            "device_security" not in self.data
            or isinstance(self.data["device_security"], list)
            and len(self.data["device_security"]) == 0
        ):
            self.data["device_security"] = {
                "bastion_hosts": [],
                "servers": [],
                "databases": [],
                "crypto_products": [],
                "other_products": [],
            }
        elif isinstance(self.data["device_security"], list):
            self.data["device_security"] = {
                "bastion_hosts": [],
                "servers": [],
                "databases": [],
                "crypto_products": [],
                "other_products": [],
            }

        # 一、堡垒机
        bastion_frame = ttk.LabelFrame(scrollable_frame, text="一、堡垒机", padding=10)
        bastion_frame.pack(fill=BOTH, expand=True, padx=10, pady=5)
        self.create_bastion_host_section(bastion_frame)

        # 二、服务器
        server_frame = ttk.LabelFrame(scrollable_frame, text="二、服务器", padding=10)
        server_frame.pack(fill=BOTH, expand=True, padx=10, pady=5)
        self.create_server_section(server_frame)

        # 三、数据库
        db_frame = ttk.LabelFrame(scrollable_frame, text="三、数据库", padding=10)
        db_frame.pack(fill=BOTH, expand=True, padx=10, pady=5)
        self.create_database_section(db_frame)

        # 四、密码产品
        crypto_frame = ttk.LabelFrame(scrollable_frame, text="四、密码产品", padding=10)
        crypto_frame.pack(fill=BOTH, expand=True, padx=10, pady=5)
        self.create_crypto_product_section(crypto_frame)

        # 五、其他产品
        other_frame = ttk.LabelFrame(scrollable_frame, text="五、其他产品", padding=10)
        other_frame.pack(fill=BOTH, expand=True, padx=10, pady=5)
        self.create_other_product_section(other_frame)

        # 保存按钮
        save_btn = ttk.Button(scrollable_frame, text="保存设备和计算安全数据", command=self.save_device_security_data)
        save_btn.pack(pady=10)

    def create_bastion_host_section(self, parent):
        """创建堡垒机部分"""
        container = ttk.Frame(parent)
        container.pack(fill=BOTH, expand=True)

        # 添加按钮
        btn_frame = ttk.Frame(container)
        btn_frame.pack(fill=X, pady=5)
        ttk.Button(btn_frame, text="+ 添加堡垒机", command=lambda: self.add_bastion_host(container)).pack(side=LEFT)

        # 存储引用
        if not hasattr(self, "bastion_host_containers"):
            self.bastion_host_containers = []
        self.bastion_host_container = container

    def add_bastion_host(self, parent):
        """添加堡垒机对象"""
        index = len(self.bastion_host_containers) + 1

        frame = ttk.LabelFrame(parent, text=f"堡垒机 {index}", padding=10)
        frame.pack(fill=BOTH, expand=True, pady=5)

        # 使用 grid 布局，需要统一所有子组件使用 grid
        row = 0

        # 顶部添加删除按钮
        top_bar = ttk.Frame(frame)
        top_bar.grid(row=row, column=0, columnspan=2, sticky=E, pady=(0, 5))
        ttk.Button(top_bar, text="删除此堡垒机", command=lambda: self.remove_bastion_host(frame)).pack(side=RIGHT)
        row += 1

        # 1. 设备名称
        ttk.Label(frame, text="设备名称:").grid(row=row, column=0, sticky=W, pady=5)
        name_entry = ttk.Entry(frame, width=50)
        name_entry.grid(row=row, column=1, sticky=W + E, pady=5, padx=5)
        row += 1

        # 2. 设备访问位置
        ttk.Label(frame, text="设备访问位置:").grid(row=row, column=0, sticky=W, pady=5)
        location_var = tk.StringVar(value="本地")
        location_combo = ttk.Combobox(
            frame, textvariable=location_var, values=["远程", "本地"], state="readonly", width=47
        )
        location_combo.grid(row=row, column=1, sticky=W, pady=5)
        row += 1

        # 3. 设备登录方式
        ttk.Label(frame, text="设备登录方式:").grid(row=row, column=0, sticky=W, pady=5)
        login_entry = ttk.Entry(frame, width=50)
        login_entry.grid(row=row, column=1, sticky=W + E, pady=5, padx=5)
        row += 1

        # 4. 远程管理通道（仅当选择远程时显示）
        remote_frame = ttk.LabelFrame(frame, text="远程管理通道", padding=10)

        ttk.Label(remote_frame, text="通信协议:").grid(row=0, column=0, sticky=W, pady=5)
        protocol_entry = ttk.Entry(remote_frame, width=50)
        protocol_entry.grid(row=0, column=1, sticky=W + E, pady=5, padx=5)

        ttk.Label(remote_frame, text="证书算法:").grid(row=1, column=0, sticky=W, pady=5)
        cert_algo_entry = ttk.Entry(remote_frame, width=50)
        cert_algo_entry.grid(row=1, column=1, sticky=W + E, pady=5, padx=5)

        ttk.Label(remote_frame, text="证书有效期:").grid(row=2, column=0, sticky=W, pady=5)
        date_frame = ttk.Frame(remote_frame)
        date_frame.grid(row=2, column=1, sticky=W + E, pady=5, padx=5)

        # 使用 grid 布局来安排日期选择器
        ttk.Label(date_frame, text="开始日期:").grid(row=0, column=0, sticky=W, padx=5)
        start_date_entry = create_date_entry(date_frame, 0, 1, "")
        ttk.Label(date_frame, text="截止日期:").grid(row=0, column=2, sticky=W, padx=(10, 0))
        end_date_entry = create_date_entry(date_frame, 0, 3, "")

        ttk.Label(remote_frame, text="证书来源:").grid(row=3, column=0, sticky=W, pady=5)
        cert_source_entry = ttk.Entry(remote_frame, width=50)
        cert_source_entry.grid(row=3, column=1, sticky=W + E, pady=5, padx=5)

        ttk.Label(remote_frame, text="机密性算法:").grid(row=4, column=0, sticky=W, pady=5)
        confidentiality_entry = ttk.Entry(remote_frame, width=50)
        confidentiality_entry.grid(row=4, column=1, sticky=W + E, pady=5, padx=5)

        ttk.Label(remote_frame, text="完整性算法:").grid(row=5, column=0, sticky=W, pady=5)
        integrity_entry = ttk.Entry(remote_frame, width=50)
        integrity_entry.grid(row=5, column=1, sticky=W + E, pady=5, padx=5)

        # 控制显示
        def toggle_remote(e=None):
            if location_var.get() == "远程":
                remote_frame.grid(row=row, column=0, columnspan=2, sticky=W + E, pady=5)
            else:
                remote_frame.grid_forget()

        location_combo.bind("<<ComboboxSelected>>", toggle_remote)

        # 5. 密码产品管理
        crypto_container = ttk.Frame(frame)
        crypto_container.grid(row=row, column=0, columnspan=2, sticky=W + E, pady=5)
        row += 1

        ttk.Label(crypto_container, text="密码产品:").pack(anchor=W)
        crypto_list_frame = ttk.Frame(crypto_container)
        crypto_list_frame.pack(fill=BOTH, expand=True)

        def add_crypto_product():
            cf = ttk.LabelFrame(crypto_list_frame, text="密码产品", padding=5)
            cf.pack(fill=X, pady=2)

            inner = ttk.Frame(cf)
            inner.pack(fill=X)

            ttk.Label(inner, text="产品名称:").pack(side=LEFT)
            pn = ttk.Entry(inner, width=15)
            pn.pack(side=LEFT, padx=5)

            ttk.Label(inner, text="厂商:").pack(side=LEFT, padx=(10, 0))
            vm = ttk.Entry(inner, width=15)
            vm.pack(side=LEFT, padx=5)

            ttk.Label(inner, text="证书编号:").pack(side=LEFT, padx=(10, 0))
            cn = ttk.Entry(inner, width=15)
            cn.pack(side=LEFT, padx=5)

            ttk.Label(inner, text="认证等级:").pack(side=LEFT, padx=(10, 0))
            cl = ttk.Entry(inner, width=10)
            cl.pack(side=LEFT, padx=5)

            ttk.Label(inner, text="使用用途:").pack(side=LEFT, padx=(10, 0))
            pu = ttk.Entry(inner, width=15)
            pu.pack(side=LEFT, padx=5)

            ttk.Button(inner, text="删除", command=cf.destroy).pack(side=LEFT, padx=10)

        ttk.Button(crypto_container, text="+ 添加密码产品", command=add_crypto_product).pack(anchor=W, pady=5)

        # 6. 其他情况说明
        ttk.Label(frame, text="其他情况说明:").grid(row=row, column=0, sticky=NW, pady=5)
        other_text = scrolledtext.ScrolledText(frame, width=60, height=3)
        other_text.grid(row=row, column=1, sticky=W + E, pady=5, padx=5)

        # 存储引用
        self.bastion_host_containers.append(
            {
                "frame": frame,
                "name": name_entry,
                "location": location_combo,
                "login": login_entry,
                "remote_frame": remote_frame,
                "protocol": protocol_entry,
                "cert_algo": cert_algo_entry,
                "start_date": start_date_entry,
                "end_date": end_date_entry,
                "cert_source": cert_source_entry,
                "confidentiality": confidentiality_entry,
                "integrity": integrity_entry,
                "crypto_container": crypto_list_frame,
                "other": other_text,
            }
        )

        # 刷新编号
        self.refresh_bastion_hosts()

    def refresh_bastion_hosts(self):
        """刷新堡垒机编号"""
        for i, item in enumerate(self.bastion_host_containers):
            item["frame"].config(text=f"堡垒机 {i+1}")

    def remove_bastion_host(self, frame_to_remove):
        """删除堡垒机对象"""
        for item in self.bastion_host_containers:
            if item["frame"] == frame_to_remove:
                item["frame"].destroy()
                self.bastion_host_containers.remove(item)
                break
        self.refresh_bastion_hosts()

    def create_server_section(self, parent):
        """创建服务器部分"""
        container = ttk.Frame(parent)
        container.pack(fill=BOTH, expand=True)

        btn_frame = ttk.Frame(container)
        btn_frame.pack(fill=X, pady=5)
        ttk.Button(btn_frame, text="+ 添加服务器", command=lambda: self.add_server(container)).pack(side=LEFT)

        if not hasattr(self, "server_containers"):
            self.server_containers = []
        self.server_container = container

    def add_server(self, parent):
        """添加服务器对象"""
        index = len(self.server_containers) + 1

        frame = ttk.LabelFrame(parent, text=f"服务器 {index}", padding=10)
        frame.pack(fill=BOTH, expand=True, pady=5)

        # 创建内部容器用于 grid 布局
        inner_frame = ttk.Frame(frame)
        inner_frame.pack(fill=BOTH, expand=True)

        # 顶部添加删除按钮
        top_bar = ttk.Frame(inner_frame)
        top_bar.grid(row=0, column=0, columnspan=2, sticky=W + E, pady=(0, 5))
        ttk.Button(top_bar, text="删除此服务器", command=lambda: self.remove_server(frame)).pack(side=RIGHT)

        # 1. 设备名称
        ttk.Label(inner_frame, text="设备名称:").grid(row=1, column=0, sticky=W, pady=5)
        name_entry = ttk.Entry(inner_frame, width=50)
        name_entry.grid(row=1, column=1, sticky=W + E, pady=5, padx=5)

        # 2. 设备运维位置
        ttk.Label(inner_frame, text="设备运维位置:").grid(row=2, column=0, sticky=W, pady=5)
        location_var = tk.StringVar(value="本地")
        location_combo = ttk.Combobox(
            inner_frame, textvariable=location_var, values=["远程", "本地"], state="readonly", width=47
        )
        location_combo.grid(row=2, column=1, sticky=W, pady=5)

        # 3. 设备登录方式
        ttk.Label(inner_frame, text="设备登录方式:").grid(row=3, column=0, sticky=W, pady=5)
        login_entry = ttk.Entry(inner_frame, width=50)
        login_entry.grid(row=3, column=1, sticky=W + E, pady=5, padx=5)

        # 4. 是否纳入堡垒机集中管控
        ttk.Label(inner_frame, text="是否纳入堡垒机集中管控:").grid(row=4, column=0, sticky=W, pady=5)
        bastion_var = tk.StringVar(value="否")
        bastion_combo = ttk.Combobox(
            inner_frame, textvariable=bastion_var, values=["是", "否"], state="readonly", width=47
        )
        bastion_combo.grid(row=4, column=1, sticky=W, pady=5)

        # 5. 远程管理通道（仅当选择远程时显示）
        remote_frame = ttk.LabelFrame(inner_frame, text="远程管理通道", padding=10)

        ttk.Label(remote_frame, text="通信协议:").grid(row=0, column=0, sticky=W, pady=5)
        protocol_entry = ttk.Entry(remote_frame, width=50)
        protocol_entry.grid(row=0, column=1, sticky=W + E, pady=5, padx=5)

        ttk.Label(remote_frame, text="机密性算法:").grid(row=1, column=0, sticky=W, pady=5)
        confidentiality_entry = ttk.Entry(remote_frame, width=50)
        confidentiality_entry.grid(row=1, column=1, sticky=W + E, pady=5, padx=5)

        ttk.Label(remote_frame, text="完整性算法:").grid(row=2, column=0, sticky=W, pady=5)
        integrity_entry = ttk.Entry(remote_frame, width=50)
        integrity_entry.grid(row=2, column=1, sticky=W + E, pady=5, padx=5)

        def toggle_remote(e=None):
            if location_var.get() == "远程":
                remote_frame.grid(row=5, column=0, columnspan=2, sticky=W + E, pady=5)
            else:
                remote_frame.grid_forget()

        location_combo.bind("<<ComboboxSelected>>", toggle_remote)

        # 6. 密码产品管理
        crypto_container = ttk.Frame(inner_frame)
        crypto_container.grid(row=6, column=0, columnspan=2, sticky=W + E, pady=5)

        ttk.Label(crypto_container, text="密码产品:").pack(anchor=W)
        crypto_list_frame = ttk.Frame(crypto_container)
        crypto_list_frame.pack(fill=BOTH, expand=True)

        def add_crypto_product():
            cf = ttk.LabelFrame(crypto_list_frame, text="密码产品", padding=5)
            cf.pack(fill=X, pady=2)

            inner = ttk.Frame(cf)
            inner.pack(fill=X)

            ttk.Label(inner, text="产品名称:").pack(side=LEFT)
            pn = ttk.Entry(inner, width=15)
            pn.pack(side=LEFT, padx=5)

            ttk.Label(inner, text="厂商:").pack(side=LEFT, padx=(10, 0))
            vm = ttk.Entry(inner, width=15)
            vm.pack(side=LEFT, padx=5)

            ttk.Label(inner, text="证书编号:").pack(side=LEFT, padx=(10, 0))
            cn = ttk.Entry(inner, width=15)
            cn.pack(side=LEFT, padx=5)

            ttk.Label(inner, text="认证等级:").pack(side=LEFT, padx=(10, 0))
            cl = ttk.Entry(inner, width=10)
            cl.pack(side=LEFT, padx=5)

            ttk.Label(inner, text="使用用途:").pack(side=LEFT, padx=(10, 0))
            pu = ttk.Entry(inner, width=15)
            pu.pack(side=LEFT, padx=5)

            ttk.Button(inner, text="删除", command=cf.destroy).pack(side=LEFT, padx=10)

        ttk.Button(crypto_container, text="+ 添加密码产品", command=add_crypto_product).pack(anchor=W, pady=5)

        # 7. 其他情况说明
        ttk.Label(inner_frame, text="其他情况说明:").grid(row=7, column=0, sticky=NW, pady=5)
        other_text = scrolledtext.ScrolledText(inner_frame, width=60, height=3)
        other_text.grid(row=7, column=1, sticky=W + E, pady=5, padx=5)

        self.server_containers.append(
            {
                "frame": frame,
                "name": name_entry,
                "location": location_combo,
                "login": login_entry,
                "bastion": bastion_combo,
                "remote_frame": remote_frame,
                "protocol": protocol_entry,
                "confidentiality": confidentiality_entry,
                "integrity": integrity_entry,
                "crypto_container": crypto_list_frame,
                "other": other_text,
            }
        )

        self.refresh_servers()

    def refresh_servers(self):
        """刷新服务器编号"""
        for i, item in enumerate(self.server_containers):
            item["frame"].config(text=f"服务器 {i+1}")

    def remove_server(self, frame_to_remove):
        """删除服务器对象"""
        for item in self.server_containers:
            if item["frame"] == frame_to_remove:
                item["frame"].destroy()
                self.server_containers.remove(item)
                break
        self.refresh_servers()

    def create_database_section(self, parent):
        """创建数据库部分"""
        container = ttk.Frame(parent)
        container.pack(fill=BOTH, expand=True)

        btn_frame = ttk.Frame(container)
        btn_frame.pack(fill=X, pady=5)
        ttk.Button(btn_frame, text="+ 添加数据库", command=lambda: self.add_database(container)).pack(side=LEFT)

        if not hasattr(self, "database_containers"):
            self.database_containers = []
        self.database_container = container

    def add_database(self, parent):
        """添加数据库对象"""
        index = len(self.database_containers) + 1

        frame = ttk.LabelFrame(parent, text=f"数据库 {index}", padding=10)
        frame.pack(fill=BOTH, expand=True, pady=5)

        # 创建内部容器用于 grid 布局
        inner_frame = ttk.Frame(frame)
        inner_frame.pack(fill=BOTH, expand=True)

        # 顶部添加删除按钮
        top_bar = ttk.Frame(inner_frame)
        top_bar.grid(row=0, column=0, columnspan=2, sticky=W + E, pady=(0, 5))
        ttk.Button(top_bar, text="删除此数据库", command=lambda: self.remove_database(frame)).pack(side=RIGHT)

        # 1. 设备名称
        ttk.Label(inner_frame, text="设备名称:").grid(row=1, column=0, sticky=W, pady=5)
        name_entry = ttk.Entry(inner_frame, width=50)
        name_entry.grid(row=1, column=1, sticky=W + E, pady=5, padx=5)

        # 2. 设备运维位置
        ttk.Label(inner_frame, text="设备运维位置:").grid(row=2, column=0, sticky=W, pady=5)
        location_var = tk.StringVar(value="本地")
        location_combo = ttk.Combobox(
            inner_frame, textvariable=location_var, values=["远程", "本地"], state="readonly", width=47
        )
        location_combo.grid(row=2, column=1, sticky=W, pady=5)

        # 3. 设备登录方式
        ttk.Label(inner_frame, text="设备登录方式:").grid(row=3, column=0, sticky=W, pady=5)
        login_entry = ttk.Entry(inner_frame, width=50)
        login_entry.grid(row=3, column=1, sticky=W + E, pady=5, padx=5)

        # 4. 是否纳入堡垒机集中管控
        ttk.Label(inner_frame, text="是否纳入堡垒机集中管控:").grid(row=4, column=0, sticky=W, pady=5)
        bastion_var = tk.StringVar(value="否")
        bastion_combo = ttk.Combobox(
            inner_frame, textvariable=bastion_var, values=["是", "否"], state="readonly", width=47
        )
        bastion_combo.grid(row=4, column=1, sticky=W, pady=5)

        # 5. 远程管理通道（仅当选择远程时显示）
        remote_frame = ttk.LabelFrame(inner_frame, text="远程管理通道", padding=10)

        ttk.Label(remote_frame, text="通信协议:").grid(row=0, column=0, sticky=W, pady=5)
        protocol_entry = ttk.Entry(remote_frame, width=50)
        protocol_entry.grid(row=0, column=1, sticky=W + E, pady=5, padx=5)

        ttk.Label(remote_frame, text="机密性算法:").grid(row=1, column=0, sticky=W, pady=5)
        confidentiality_entry = ttk.Entry(remote_frame, width=50)
        confidentiality_entry.grid(row=1, column=1, sticky=W + E, pady=5, padx=5)

        ttk.Label(remote_frame, text="完整性算法:").grid(row=2, column=0, sticky=W, pady=5)
        integrity_entry = ttk.Entry(remote_frame, width=50)
        integrity_entry.grid(row=2, column=1, sticky=W + E, pady=5, padx=5)

        def toggle_remote(e=None):
            if location_var.get() == "远程":
                remote_frame.grid(row=5, column=0, columnspan=2, sticky=W + E, pady=5)
            else:
                remote_frame.grid_forget()

        location_combo.bind("<<ComboboxSelected>>", toggle_remote)

        # 6. 密码产品管理
        crypto_container = ttk.Frame(inner_frame)
        crypto_container.grid(row=6, column=0, columnspan=2, sticky=W + E, pady=5)

        ttk.Label(crypto_container, text="密码产品:").pack(anchor=W)
        crypto_list_frame = ttk.Frame(crypto_container)
        crypto_list_frame.pack(fill=BOTH, expand=True)

        def add_crypto_product():
            cf = ttk.LabelFrame(crypto_list_frame, text="密码产品", padding=5)
            cf.pack(fill=X, pady=2)

            inner = ttk.Frame(cf)
            inner.pack(fill=X)

            ttk.Label(inner, text="产品名称:").pack(side=LEFT)
            pn = ttk.Entry(inner, width=15)
            pn.pack(side=LEFT, padx=5)

            ttk.Label(inner, text="厂商:").pack(side=LEFT, padx=(10, 0))
            vm = ttk.Entry(inner, width=15)
            vm.pack(side=LEFT, padx=5)

            ttk.Label(inner, text="证书编号:").pack(side=LEFT, padx=(10, 0))
            cn = ttk.Entry(inner, width=15)
            cn.pack(side=LEFT, padx=5)

            ttk.Label(inner, text="认证等级:").pack(side=LEFT, padx=(10, 0))
            cl = ttk.Entry(inner, width=10)
            cl.pack(side=LEFT, padx=5)

            ttk.Label(inner, text="使用用途:").pack(side=LEFT, padx=(10, 0))
            pu = ttk.Entry(inner, width=15)
            pu.pack(side=LEFT, padx=5)

            ttk.Button(inner, text="删除", command=cf.destroy).pack(side=LEFT, padx=10)

        ttk.Button(crypto_container, text="+ 添加密码产品", command=add_crypto_product).pack(anchor=W, pady=5)

        # 7. 其他情况说明
        ttk.Label(inner_frame, text="其他情况说明:").grid(row=7, column=0, sticky=NW, pady=5)
        other_text = scrolledtext.ScrolledText(inner_frame, width=60, height=3)
        other_text.grid(row=7, column=1, sticky=W + E, pady=5, padx=5)

        self.database_containers.append(
            {
                "frame": frame,
                "name": name_entry,
                "location": location_combo,
                "login": login_entry,
                "bastion": bastion_combo,
                "remote_frame": remote_frame,
                "protocol": protocol_entry,
                "confidentiality": confidentiality_entry,
                "integrity": integrity_entry,
                "crypto_container": crypto_list_frame,
                "other": other_text,
            }
        )

        self.refresh_databases()

    def refresh_databases(self):
        """刷新数据库编号"""
        for i, item in enumerate(self.database_containers):
            item["frame"].config(text=f"数据库 {i+1}")

    def remove_database(self, frame_to_remove):
        """删除数据库对象"""
        for item in self.database_containers:
            if item["frame"] == frame_to_remove:
                item["frame"].destroy()
                self.database_containers.remove(item)
                break
        self.refresh_databases()

    def create_crypto_product_section(self, parent):
        """创建密码产品部分"""
        container = ttk.Frame(parent)
        container.pack(fill=BOTH, expand=True)

        btn_frame = ttk.Frame(container)
        btn_frame.pack(fill=X, pady=5)
        ttk.Button(btn_frame, text="+ 添加密码产品", command=lambda: self.add_crypto_product_item(container)).pack(
            side=LEFT
        )
        ttk.Button(btn_frame, text="从其他模块同步密码产品", command=lambda: self.sync_crypto_products(container)).pack(
            side=LEFT, padx=10
        )

        if not hasattr(self, "crypto_product_items"):
            self.crypto_product_items = []
        self.crypto_product_container = container

    def add_crypto_product_item(self, parent):
        """添加密码产品对象"""
        index = len(self.crypto_product_items) + 1

        frame = ttk.LabelFrame(parent, text=f"密码产品 {index}", padding=10)
        frame.pack(fill=BOTH, expand=True, pady=5)

        # 创建内部容器用于 grid 布局
        inner_frame = ttk.Frame(frame)
        inner_frame.pack(fill=BOTH, expand=True)

        # 顶部添加删除按钮
        top_bar = ttk.Frame(inner_frame)
        top_bar.grid(row=0, column=0, columnspan=2, sticky=W + E, pady=(0, 5))
        ttk.Button(top_bar, text="删除此密码产品", command=lambda: self.remove_crypto_product_item(frame)).pack(
            side=RIGHT
        )

        # 1. 密码产品名称
        ttk.Label(inner_frame, text="密码产品名称:").grid(row=1, column=0, sticky=W, pady=5)
        name_entry = ttk.Entry(inner_frame, width=50)
        name_entry.grid(row=1, column=1, sticky=W + E, pady=5, padx=5)

        # 2. 密码产品厂商
        ttk.Label(inner_frame, text="密码产品厂商:").grid(row=2, column=0, sticky=W, pady=5)
        vendor_entry = ttk.Entry(inner_frame, width=50)
        vendor_entry.grid(row=2, column=1, sticky=W + E, pady=5, padx=5)

        # 3. 密码产品证书
        ttk.Label(inner_frame, text="密码产品证书编号:").grid(row=3, column=0, sticky=W, pady=5)
        cert_entry = ttk.Entry(inner_frame, width=50)
        cert_entry.grid(row=3, column=1, sticky=W + E, pady=5, padx=5)

        # 4. 密码产品等级
        ttk.Label(inner_frame, text="密码产品等级:").grid(row=4, column=0, sticky=W, pady=5)
        level_entry = ttk.Entry(inner_frame, width=50)
        level_entry.grid(row=4, column=1, sticky=W + E, pady=5, padx=5)

        # 5. 密码产品用途
        ttk.Label(inner_frame, text="密码产品用途:").grid(row=5, column=0, sticky=W, pady=5)
        purpose_entry = ttk.Entry(inner_frame, width=50)
        purpose_entry.grid(row=5, column=1, sticky=W + E, pady=5, padx=5)

        # 6. 设备运维位置
        ttk.Label(inner_frame, text="设备运维位置:").grid(row=6, column=0, sticky=W, pady=5)
        location_var = tk.StringVar(value="本地")
        location_combo = ttk.Combobox(
            inner_frame, textvariable=location_var, values=["远程", "本地"], state="readonly", width=47
        )
        location_combo.grid(row=6, column=1, sticky=W, pady=5)

        # 7. 设备登录方式
        ttk.Label(inner_frame, text="设备登录方式:").grid(row=7, column=0, sticky=W, pady=5)
        login_entry = ttk.Entry(inner_frame, width=50)
        login_entry.grid(row=7, column=1, sticky=W + E, pady=5, padx=5)

        # 8. 是否纳入堡垒机集中管控
        ttk.Label(inner_frame, text="是否纳入堡垒机集中管控:").grid(row=8, column=0, sticky=W, pady=5)
        bastion_var = tk.StringVar(value="否")
        bastion_combo = ttk.Combobox(
            inner_frame, textvariable=bastion_var, values=["是", "否"], state="readonly", width=47
        )
        bastion_combo.grid(row=8, column=1, sticky=W, pady=5)

        # 9. 远程管理通道（仅当选择远程时显示）
        remote_frame = ttk.LabelFrame(inner_frame, text="远程管理通道", padding=10)

        ttk.Label(remote_frame, text="通信协议:").grid(row=0, column=0, sticky=W, pady=5)
        protocol_entry = ttk.Entry(remote_frame, width=50)
        protocol_entry.grid(row=0, column=1, sticky=W + E, pady=5, padx=5)

        ttk.Label(remote_frame, text="机密性算法:").grid(row=1, column=0, sticky=W, pady=5)
        confidentiality_entry = ttk.Entry(remote_frame, width=50)
        confidentiality_entry.grid(row=1, column=1, sticky=W + E, pady=5, padx=5)

        ttk.Label(remote_frame, text="完整性算法:").grid(row=2, column=0, sticky=W, pady=5)
        integrity_entry = ttk.Entry(remote_frame, width=50)
        integrity_entry.grid(row=2, column=1, sticky=W + E, pady=5, padx=5)

        def toggle_remote(e=None):
            if location_var.get() == "远程":
                remote_frame.grid(row=9, column=0, columnspan=2, sticky=W + E, pady=5)
            else:
                remote_frame.grid_forget()

        location_combo.bind("<<ComboboxSelected>>", toggle_remote)

        self.crypto_product_items.append(
            {
                "frame": frame,
                "name": name_entry,
                "vendor": vendor_entry,
                "cert": cert_entry,
                "level": level_entry,
                "purpose": purpose_entry,
                "location": location_combo,
                "login": login_entry,
                "bastion": bastion_combo,
                "remote_frame": remote_frame,
                "protocol": protocol_entry,
                "confidentiality": confidentiality_entry,
                "integrity": integrity_entry,
            }
        )

        self.refresh_crypto_products()

    def refresh_crypto_products(self):
        """刷新密码产品编号"""
        for i, item in enumerate(self.crypto_product_items):
            item["frame"].config(text=f"密码产品 {i+1}")

    def remove_crypto_product_item(self, frame_to_remove):
        """删除密码产品对象"""
        for item in self.crypto_product_items:
            if item["frame"] == frame_to_remove:
                item["frame"].destroy()
                self.crypto_product_items.remove(item)
                break
        self.refresh_crypto_products()

    def sync_crypto_products(self, parent):
        """从其他模块同步密码产品信息"""
        # 收集所有密码产品信息
        all_crypto = {}

        # ================= 1. 从物理和环境安全模块收集 =================
        if hasattr(self, "physical_objects"):
            for obj in self.physical_objects:
                # 从访问控制部分收集
                access_ctrl = obj.get("access_ctrl", {})
                detail_frame = access_ctrl.get("detail_frame")
                if detail_frame:
                    crypto_data_list = self.extract_crypto_from_physical_detail(detail_frame)
                    for crypto_data in crypto_data_list:
                        if crypto_data:
                            cert = crypto_data.get("cert", "")
                            if cert and cert not in all_crypto:
                                all_crypto[cert] = crypto_data

                # 从门禁完整性部分收集
                door_integrity = obj.get("door_integrity", {})
                detail_frame = door_integrity.get("detail_frame")
                if detail_frame:
                    crypto_data_list = self.extract_crypto_from_physical_detail(detail_frame)
                    for crypto_data in crypto_data_list:
                        if crypto_data:
                            cert = crypto_data.get("cert", "")
                            if cert and cert not in all_crypto:
                                all_crypto[cert] = crypto_data

                # 从视频监控完整性部分收集
                video_integrity = obj.get("video_integrity", {})
                detail_frame = video_integrity.get("detail_frame")
                if detail_frame:
                    crypto_data_list = self.extract_crypto_from_physical_detail(detail_frame)
                    for crypto_data in crypto_data_list:
                        if crypto_data:
                            cert = crypto_data.get("cert", "")
                            if cert and cert not in all_crypto:
                                all_crypto[cert] = crypto_data

        # ================= 2. 从网络和通信安全模块收集 =================
        # 从客户端与系统之间通道收集
        if hasattr(self, "client_server_channels"):
            for subsystem_name, channels in self.client_server_channels.items():
                for channel in channels:
                    crypto_container = channel.get("crypto_container")
                    if crypto_container and crypto_container.winfo_exists():
                        try:
                            for crypto_frame in crypto_container.winfo_children():
                                if isinstance(crypto_frame, ttk.LabelFrame):
                                    crypto_data = self.extract_crypto_from_frame(crypto_frame)
                                    if crypto_data:
                                        cert = crypto_data.get("cert", "")
                                        if cert and cert not in all_crypto:
                                            all_crypto[cert] = crypto_data
                        except (AttributeError, TypeError):
                            pass

        # 从系统与系统之间通道收集
        if hasattr(self, "system_system_channels"):
            for subsystem_name, channels in self.system_system_channels.items():
                for channel in channels:
                    crypto_container = channel.get("crypto_container")
                    if crypto_container and crypto_container.winfo_exists():
                        try:
                            for crypto_frame in crypto_container.winfo_children():
                                if isinstance(crypto_frame, ttk.LabelFrame):
                                    crypto_data = self.extract_crypto_from_frame(crypto_frame)
                                    if crypto_data:
                                        cert = crypto_data.get("cert", "")
                                        if cert and cert not in all_crypto:
                                            all_crypto[cert] = crypto_data
                        except (AttributeError, TypeError):
                            pass

        # ================= 3. 从设备和计算安全模块收集 =================
        # 从堡垒机收集
        if hasattr(self, "bastion_host_containers"):
            for bh in self.bastion_host_containers:
                crypto_container = bh.get("crypto_container")
                if crypto_container and crypto_container.winfo_exists():
                    try:
                        for crypto_frame in crypto_container.winfo_children():
                            if isinstance(crypto_frame, ttk.LabelFrame):
                                crypto_data = self.extract_crypto_from_frame(crypto_frame)
                                if crypto_data:
                                    cert = crypto_data.get("cert", "")
                                    if cert and cert not in all_crypto:
                                        all_crypto[cert] = crypto_data
                    except (AttributeError, TypeError):
                        pass

        # 从服务器收集
        if hasattr(self, "server_containers"):
            for srv in self.server_containers:
                crypto_container = srv.get("crypto_container")
                if crypto_container and crypto_container.winfo_exists():
                    try:
                        for crypto_frame in crypto_container.winfo_children():
                            if isinstance(crypto_frame, ttk.LabelFrame):
                                crypto_data = self.extract_crypto_from_frame(crypto_frame)
                                if crypto_data:
                                    cert = crypto_data.get("cert", "")
                                    if cert and cert not in all_crypto:
                                        all_crypto[cert] = crypto_data
                    except (AttributeError, TypeError):
                        pass

        # 从数据库收集
        if hasattr(self, "database_containers"):
            for db in self.database_containers:
                crypto_container = db.get("crypto_container")
                if crypto_container and crypto_container.winfo_exists():
                    try:
                        for crypto_frame in crypto_container.winfo_children():
                            if isinstance(crypto_frame, ttk.LabelFrame):
                                crypto_data = self.extract_crypto_from_frame(crypto_frame)
                                if crypto_data:
                                    cert = crypto_data.get("cert", "")
                                    if cert and cert not in all_crypto:
                                        all_crypto[cert] = crypto_data
                    except (AttributeError, TypeError):
                        pass

        # 从设备和计算 - 密码产品模块收集
        if hasattr(self, "crypto_product_items"):
            for cp in self.crypto_product_items:
                cert = cp["cert"].get()
                if cert and cert not in all_crypto:
                    all_crypto[cert] = {
                        "name": cp["name"].get(),
                        "vendor": cp["vendor"].get(),
                        "cert": cert,
                        "level": cp["level"].get(),
                        "purpose": cp["purpose"].get(),
                    }

        # ================= 4. 从应用和数据安全模块收集 =================
        # 4.1 从应用和密码产品列表收集
        if hasattr(self, "app_crypto_products"):
            for subsystem_name, products in self.app_crypto_products.items():
                for prod in products:
                    cert = prod["cert_no"].get()
                    if cert and cert not in all_crypto:
                        all_crypto[cert] = {
                            "name": prod["name"].get(),
                            "vendor": prod["vendor"].get(),
                            "cert": cert,
                            "level": prod["level"].get(),
                            "purpose": prod["usage"].get(),
                        }

        # 4.2 从重要数据的传输与存储功能收集
        if hasattr(self, "app_data_crypto_products"):
            for key, products in self.app_data_crypto_products.items():
                for prod in products:
                    cert = prod["cert_no"].get()
                    if cert and cert not in all_crypto:
                        all_crypto[cert] = {
                            "name": prod["name"].get(),
                            "vendor": prod["vendor"].get(),
                            "cert": cert,
                            "level": prod["level"].get(),
                            "purpose": prod["usage"].get(),
                        }

        # 4.3 从不可否认性功能收集
        if hasattr(self, "app_scene_crypto_products"):
            for key, products in self.app_scene_crypto_products.items():
                for prod in products:
                    cert = prod["cert_no"].get()
                    if cert and cert not in all_crypto:
                        all_crypto[cert] = {
                            "name": prod["name"].get(),
                            "vendor": prod["vendor"].get(),
                            "cert": cert,
                            "level": prod["level"].get(),
                            "purpose": prod["usage"].get(),
                        }

        if not all_crypto:
            messagebox.showinfo("提示", "未找到可同步的密码产品信息")
            return

        # 获取当前已有的密码产品列表及其信息
        existing_products = {}  # cert -> {item_index, name, vendor, level, purpose}
        for idx, item in enumerate(self.crypto_product_items):
            cert = item["cert"].get()
            if cert:
                existing_products[cert] = {
                    "index": idx,
                    "name": item["name"].get(),
                    "vendor": item["vendor"].get(),
                    "level": item["level"].get(),
                    "purpose": item["purpose"].get(),
                }

        # 统计新增和更新的数量
        new_count = 0
        update_count = 0

        # 为每个密码产品进行检查（新增或更新）
        for cert, data in all_crypto.items():
            if cert not in existing_products:
                # 证书编号不存在，添加新产品
                self.add_crypto_product_item(parent)
                item = self.crypto_product_items[-1]
                item["name"].insert(0, data.get("name", ""))
                item["vendor"].insert(0, data.get("vendor", ""))
                item["cert"].insert(0, data.get("cert", ""))
                item["level"].insert(0, data.get("level", ""))
                item["purpose"].insert(0, data.get("purpose", ""))
                new_count += 1
            else:
                # 证书编号已存在，检查其他字段是否有更新
                existing = existing_products[cert]
                needs_update = False

                # 比对名称、厂商、等级、用途是否有变化
                if data.get("name", "") != existing["name"]:
                    needs_update = True
                if data.get("vendor", "") != existing["vendor"]:
                    needs_update = True
                if data.get("level", "") != existing["level"]:
                    needs_update = True
                if data.get("purpose", "") != existing["purpose"]:
                    needs_update = True

                if needs_update:
                    # 更新已有产品信息
                    item = self.crypto_product_items[existing["index"]]
                    # 清空并重新填入更新后的值
                    item["name"].delete(0, END)
                    item["name"].insert(0, data.get("name", ""))
                    item["vendor"].delete(0, END)
                    item["vendor"].insert(0, data.get("vendor", ""))
                    item["level"].delete(0, END)
                    item["level"].insert(0, data.get("level", ""))
                    item["purpose"].delete(0, END)
                    item["purpose"].insert(0, data.get("purpose", ""))
                    update_count += 1

        # 显示结果提示
        if new_count == 0 and update_count == 0:
            messagebox.showinfo("提示", "所有密码产品已存在且无更新，无需同步")
        elif new_count > 0 and update_count > 0:
            messagebox.showinfo("成功", f"已同步 {new_count} 个新的密码产品，更新了 {update_count} 个密码产品信息")
        elif new_count > 0:
            messagebox.showinfo("成功", f"已同步 {new_count} 个新的密码产品")
        else:
            messagebox.showinfo("成功", f"已更新 {update_count} 个密码产品信息")

    def extract_crypto_from_physical_detail(self, detail_frame):
        """从物理安全详情框架中提取密码产品数据列表"""
        crypto_list = []

        # 查找密码产品列表框架
        for widget in detail_frame.winfo_children():
            if isinstance(widget, ttk.LabelFrame) and "密码产品" in widget.cget("text"):
                # 在产品列表中查找 prod_container 框架（产品的实际容器）
                prod_container = None
                for child in widget.winfo_children():
                    if isinstance(child, ttk.Frame):
                        # 检查这个 Frame 是否包含产品帧（通过检查其子组件是否有 Entry）
                        for grandchild in child.winfo_children():
                            if isinstance(grandchild, ttk.Frame):
                                prod_container = child
                                break
                        if prod_container:
                            break

                # 如果找到了 prod_container，遍历其中的产品帧
                if prod_container:
                    for prod_frame in prod_container.winfo_children():
                        if isinstance(prod_frame, ttk.Frame):
                            entries = {}
                            for child in prod_frame.winfo_children():
                                if isinstance(child, ttk.Label):
                                    label_text = child.cget("text").replace(":", "")
                                    # 查找下一个 Entry 组件
                                    for sibling in prod_frame.winfo_children():
                                        if isinstance(sibling, ttk.Entry) and sibling.winfo_x() > child.winfo_x():
                                            entries[label_text] = sibling
                                            break

                            if entries:
                                crypto_data = {
                                    "name": entries.get("产品名称", ttk.Entry()).get(),
                                    "vendor": entries.get("厂商", ttk.Entry()).get(),
                                    "cert": entries.get("证书编号", ttk.Entry()).get(),
                                    "level": entries.get("认证等级", ttk.Entry()).get(),
                                    "purpose": entries.get("用途", ttk.Entry()).get(),
                                }
                                if crypto_data.get("cert"):
                                    crypto_list.append(crypto_data)
                else:
                    # 兼容旧逻辑：直接在 LabelFrame 下查找产品帧
                    for prod_frame in widget.winfo_children():
                        if isinstance(prod_frame, ttk.Frame):
                            entries = {}
                            for child in prod_frame.winfo_children():
                                if isinstance(child, ttk.Label):
                                    label_text = child.cget("text").replace(":", "")
                                    # 查找下一个 Entry 组件
                                    for sibling in prod_frame.winfo_children():
                                        if isinstance(sibling, ttk.Entry) and sibling.winfo_x() > child.winfo_x():
                                            entries[label_text] = sibling
                                            break

                            if entries:
                                crypto_data = {
                                    "name": entries.get("产品名称", ttk.Entry()).get(),
                                    "vendor": entries.get("厂商", ttk.Entry()).get(),
                                    "cert": entries.get("证书编号", ttk.Entry()).get(),
                                    "level": entries.get("认证等级", ttk.Entry()).get(),
                                    "purpose": entries.get("用途", ttk.Entry()).get(),
                                }
                                if crypto_data.get("cert"):
                                    crypto_list.append(crypto_data)

        return crypto_list

    def extract_crypto_from_frame(self, crypto_frame):
        """从密码产品框架中提取数据"""
        data = {}
        for widget in crypto_frame.winfo_children():
            if isinstance(widget, ttk.Frame):
                for child in widget.winfo_children():
                    if isinstance(child, ttk.Label):
                        label_text = child.cget("text")
                        next_widget = child.master
                        # 简单提取逻辑
                        pass
        # 简化处理：遍历查找 Entry 组件
        entries = []
        for widget in crypto_frame.winfo_children():
            if isinstance(widget, ttk.Frame):
                for child in widget.winfo_children():
                    if isinstance(child, ttk.Entry):
                        entries.append(child)

        if len(entries) >= 5:
            data["name"] = entries[0].get()
            data["vendor"] = entries[1].get()
            data["cert"] = entries[2].get()
            data["level"] = entries[3].get()
            data["purpose"] = entries[4].get()

        return data

    def create_other_product_section(self, parent):
        """创建其他产品部分"""
        container = ttk.Frame(parent)
        container.pack(fill=BOTH, expand=True)

        btn_frame = ttk.Frame(container)
        btn_frame.pack(fill=X, pady=5)
        ttk.Button(btn_frame, text="+ 添加其他产品", command=lambda: self.add_other_product(container)).pack(side=LEFT)

        if not hasattr(self, "other_product_containers"):
            self.other_product_containers = []
        self.other_product_container = container

    def add_other_product(self, parent):
        """添加其他产品对象"""
        index = len(self.other_product_containers) + 1

        frame = ttk.LabelFrame(parent, text=f"其他产品 {index}", padding=10)
        frame.pack(fill=BOTH, expand=True, pady=5)

        # 创建内部容器用于 grid 布局
        inner_frame = ttk.Frame(frame)
        inner_frame.pack(fill=BOTH, expand=True)

        # 1. 设备名称
        ttk.Label(inner_frame, text="设备名称:").grid(row=0, column=0, sticky=W, pady=5)
        name_entry = ttk.Entry(inner_frame, width=50)
        name_entry.grid(row=0, column=1, sticky=W + E, pady=5, padx=5)

        # 2. 设备运维位置
        ttk.Label(inner_frame, text="设备运维位置:").grid(row=1, column=0, sticky=W, pady=5)
        location_var = tk.StringVar(value="本地")
        location_combo = ttk.Combobox(
            inner_frame, textvariable=location_var, values=["远程", "本地"], state="readonly", width=47
        )
        location_combo.grid(row=1, column=1, sticky=W, pady=5)

        # 3. 设备登录方式
        ttk.Label(inner_frame, text="设备登录方式:").grid(row=2, column=0, sticky=W, pady=5)
        login_entry = ttk.Entry(inner_frame, width=50)
        login_entry.grid(row=2, column=1, sticky=W + E, pady=5, padx=5)

        # 4. 是否纳入堡垒机集中管控
        ttk.Label(inner_frame, text="是否纳入堡垒机集中管控:").grid(row=3, column=0, sticky=W, pady=5)
        bastion_var = tk.StringVar(value="否")
        bastion_combo = ttk.Combobox(
            inner_frame, textvariable=bastion_var, values=["是", "否"], state="readonly", width=47
        )
        bastion_combo.grid(row=3, column=1, sticky=W, pady=5)

        # 5. 远程管理通道（仅当选择远程时显示）
        remote_frame = ttk.LabelFrame(inner_frame, text="远程管理通道", padding=10)

        ttk.Label(remote_frame, text="通信协议:").grid(row=0, column=0, sticky=W, pady=5)
        protocol_entry = ttk.Entry(remote_frame, width=50)
        protocol_entry.grid(row=0, column=1, sticky=W + E, pady=5, padx=5)

        ttk.Label(remote_frame, text="机密性算法:").grid(row=1, column=0, sticky=W, pady=5)
        confidentiality_entry = ttk.Entry(remote_frame, width=50)
        confidentiality_entry.grid(row=1, column=1, sticky=W + E, pady=5, padx=5)

        ttk.Label(remote_frame, text="完整性算法:").grid(row=2, column=0, sticky=W, pady=5)
        integrity_entry = ttk.Entry(remote_frame, width=50)
        integrity_entry.grid(row=2, column=1, sticky=W + E, pady=5, padx=5)

        def toggle_remote(e=None):
            if location_var.get() == "远程":
                remote_frame.grid(row=4, column=0, columnspan=2, sticky=W + E, pady=5)
            else:
                remote_frame.grid_forget()

        location_combo.bind("<<ComboboxSelected>>", toggle_remote)

        # 6. 密码产品管理
        crypto_container = ttk.Frame(inner_frame)
        crypto_container.grid(row=5, column=0, columnspan=2, sticky=W + E, pady=5)

        ttk.Label(crypto_container, text="密码产品:").pack(anchor=W)
        crypto_list_frame = ttk.Frame(crypto_container)
        crypto_list_frame.pack(fill=BOTH, expand=True)

        def add_crypto_product():
            cf = ttk.LabelFrame(crypto_list_frame, text="密码产品", padding=5)
            cf.pack(fill=X, pady=2)

            inner = ttk.Frame(cf)
            inner.pack(fill=X)

            ttk.Label(inner, text="产品名称:").pack(side=LEFT)
            pn = ttk.Entry(inner, width=15)
            pn.pack(side=LEFT, padx=5)

            ttk.Label(inner, text="厂商:").pack(side=LEFT, padx=(10, 0))
            vm = ttk.Entry(inner, width=15)
            vm.pack(side=LEFT, padx=5)

            ttk.Label(inner, text="证书编号:").pack(side=LEFT, padx=(10, 0))
            cn = ttk.Entry(inner, width=15)
            cn.pack(side=LEFT, padx=5)

            ttk.Label(inner, text="认证等级:").pack(side=LEFT, padx=(10, 0))
            cl = ttk.Entry(inner, width=10)
            cl.pack(side=LEFT, padx=5)

            ttk.Label(inner, text="使用用途:").pack(side=LEFT, padx=(10, 0))
            pu = ttk.Entry(inner, width=15)
            pu.pack(side=LEFT, padx=5)

            ttk.Button(inner, text="删除", command=cf.destroy).pack(side=LEFT, padx=10)

        ttk.Button(crypto_container, text="+ 添加密码产品", command=add_crypto_product).pack(anchor=W, pady=5)

        self.other_product_containers.append(
            {
                "frame": frame,
                "name": name_entry,
                "location": location_combo,
                "login": login_entry,
                "bastion": bastion_combo,
                "remote_frame": remote_frame,
                "protocol": protocol_entry,
                "confidentiality": confidentiality_entry,
                "integrity": integrity_entry,
                "crypto_container": crypto_list_frame,
            }
        )

        self.refresh_other_products()

    def refresh_other_products(self):
        """刷新其他产品编号"""
        for i, item in enumerate(self.other_product_containers):
            item["frame"].config(text=f"其他产品 {i+1}")

    def save_device_security_data(self):
        """保存设备和计算安全数据"""
        # 保存堡垒机数据
        bastion_data = []
        if hasattr(self, "bastion_host_containers"):
            for item in self.bastion_host_containers:
                crypto_products = []
                for cf in item["crypto_container"].winfo_children():
                    if isinstance(cf, ttk.LabelFrame):
                        entries = []
                        for w in cf.winfo_children():
                            if isinstance(w, ttk.Frame):
                                for c in w.winfo_children():
                                    if isinstance(c, ttk.Entry):
                                        entries.append(c.get())
                        if len(entries) >= 5:
                            crypto_products.append(
                                {
                                    "name": entries[0],
                                    "vendor": entries[1],
                                    "cert": entries[2],
                                    "level": entries[3],
                                    "purpose": entries[4],
                                }
                            )

                bastion_data.append(
                    {
                        "name": item["name"].get(),
                        "location": item["location"].get(),
                        "login": item["login"].get(),
                        "remote": (
                            {
                                "protocol": item["protocol"].get(),
                                "cert_algo": item["cert_algo"].get(),
                                "start_date": item["start_date"].get(),
                                "end_date": item["end_date"].get(),
                                "cert_source": item["cert_source"].get(),
                                "confidentiality": item["confidentiality"].get(),
                                "integrity": item["integrity"].get(),
                            }
                            if item["location"].get() == "远程"
                            else {}
                        ),
                        "crypto_products": crypto_products,
                        "other": item["other"].get("1.0", END).strip(),
                    }
                )

        # 保存服务器数据
        server_data = []
        if hasattr(self, "server_containers"):
            for item in self.server_containers:
                crypto_products = []
                for cf in item["crypto_container"].winfo_children():
                    if isinstance(cf, ttk.LabelFrame):
                        entries = []
                        for w in cf.winfo_children():
                            if isinstance(w, ttk.Frame):
                                for c in w.winfo_children():
                                    if isinstance(c, ttk.Entry):
                                        entries.append(c.get())
                        if len(entries) >= 5:
                            crypto_products.append(
                                {
                                    "name": entries[0],
                                    "vendor": entries[1],
                                    "cert": entries[2],
                                    "level": entries[3],
                                    "purpose": entries[4],
                                }
                            )

                server_data.append(
                    {
                        "name": item["name"].get(),
                        "location": item["location"].get(),
                        "login": item["login"].get(),
                        "bastion_controlled": item["bastion"].get(),
                        "remote": (
                            {
                                "protocol": item["protocol"].get(),
                                "confidentiality": item["confidentiality"].get(),
                                "integrity": item["integrity"].get(),
                            }
                            if item["location"].get() == "远程"
                            else {}
                        ),
                        "crypto_products": crypto_products,
                        "other": item["other"].get("1.0", END).strip(),
                    }
                )

        # 保存数据库数据
        database_data = []
        if hasattr(self, "database_containers"):
            for item in self.database_containers:
                crypto_products = []
                for cf in item["crypto_container"].winfo_children():
                    if isinstance(cf, ttk.LabelFrame):
                        entries = []
                        for w in cf.winfo_children():
                            if isinstance(w, ttk.Frame):
                                for c in w.winfo_children():
                                    if isinstance(c, ttk.Entry):
                                        entries.append(c.get())
                        if len(entries) >= 5:
                            crypto_products.append(
                                {
                                    "name": entries[0],
                                    "vendor": entries[1],
                                    "cert": entries[2],
                                    "level": entries[3],
                                    "purpose": entries[4],
                                }
                            )

                database_data.append(
                    {
                        "name": item["name"].get(),
                        "location": item["location"].get(),
                        "login": item["login"].get(),
                        "bastion_controlled": item["bastion"].get(),
                        "remote": (
                            {
                                "protocol": item["protocol"].get(),
                                "confidentiality": item["confidentiality"].get(),
                                "integrity": item["integrity"].get(),
                            }
                            if item["location"].get() == "远程"
                            else {}
                        ),
                        "crypto_products": crypto_products,
                        "other": item["other"].get("1.0", END).strip(),
                    }
                )

        # 保存密码产品数据
        crypto_product_data = []
        if hasattr(self, "crypto_product_items"):
            for item in self.crypto_product_items:
                crypto_product_data.append(
                    {
                        "name": item["name"].get(),
                        "vendor": item["vendor"].get(),
                        "cert": item["cert"].get(),
                        "level": item["level"].get(),
                        "purpose": item["purpose"].get(),
                        "location": item["location"].get(),
                        "login": item["login"].get(),
                        "bastion_controlled": item["bastion"].get(),
                        "remote": (
                            {
                                "protocol": item["protocol"].get(),
                                "confidentiality": item["confidentiality"].get(),
                                "integrity": item["integrity"].get(),
                            }
                            if item["location"].get() == "远程"
                            else {}
                        ),
                    }
                )

        # 保存其他产品数据
        other_product_data = []
        if hasattr(self, "other_product_containers"):
            for item in self.other_product_containers:
                crypto_products = []
                for cf in item["crypto_container"].winfo_children():
                    if isinstance(cf, ttk.LabelFrame):
                        entries = []
                        for w in cf.winfo_children():
                            if isinstance(w, ttk.Frame):
                                for c in w.winfo_children():
                                    if isinstance(c, ttk.Entry):
                                        entries.append(c.get())
                        if len(entries) >= 5:
                            crypto_products.append(
                                {
                                    "name": entries[0],
                                    "vendor": entries[1],
                                    "cert": entries[2],
                                    "level": entries[3],
                                    "purpose": entries[4],
                                }
                            )

                other_product_data.append(
                    {
                        "name": item["name"].get(),
                        "location": item["location"].get(),
                        "login": item["login"].get(),
                        "bastion_controlled": item["bastion"].get(),
                        "remote": (
                            {
                                "protocol": item["protocol"].get(),
                                "confidentiality": item["confidentiality"].get(),
                                "integrity": item["integrity"].get(),
                            }
                            if item["location"].get() == "远程"
                            else {}
                        ),
                        "crypto_products": crypto_products,
                    }
                )

        # 更新数据字典
        self.data["device_security"] = {
            "bastion_hosts": bastion_data,
            "servers": server_data,
            "databases": database_data,
            "crypto_products": crypto_product_data,
            "other_products": other_product_data,
        }

        messagebox.showinfo("成功", "设备和计算安全数据保存成功！")

    def create_application_security_tab(self):
        """创建应用和数据安全测评选项卡"""
        tab = ttk.Frame(self.notebook)
        self.notebook.add(tab, text="📱 应用和数据安全")

        # 使用优化后的 create_scrollable_canvas 方法
        canvas, scrollable_frame = self.create_scrollable_canvas(tab)

        # 初始化应用和数据安全数据存储
        if "application_security" not in self.data or isinstance(self.data["application_security"], list):
            self.data["application_security"] = {}

        # 获取子系统列表
        self.app_subsystem_container = ttk.LabelFrame(scrollable_frame, text="子系统选择", padding=15)
        self.app_subsystem_container.pack(fill=X, padx=10, pady=10)
        self.app_subsystem_container.configure(style='Custom.TLabelframe')

        self.app_subsystem_vars = {}
        self.app_subsystem_frames = {}

        # 刷新子系统列表按钮
        ttk.Button(
            self.app_subsystem_container,
            text="刷新子系统列表",
            command=lambda: self.refresh_app_subsystems(scrollable_frame),
        ).pack(pady=5)

        self.app_subsystems_loaded = False

        # 保存按钮
        save_btn = ttk.Button(
            scrollable_frame, text="保存应用和数据安全数据", command=lambda: self.save_application_security_data()
        )
        save_btn.pack(pady=10)

    def refresh_app_subsystems(self, parent=None):
        """刷新子系统列表并创建对应的测评区域 - 优化版"""
        # 清除旧的子系统框架（除了容器本身）
        for frame in list(self.app_subsystem_frames.values()):
            frame.destroy()
        self.app_subsystem_frames.clear()
        self.app_subsystem_vars.clear()

        # 使用缓存的子系统列表，避免重复计算
        subsystems = self._get_subsystems()

        if not subsystems:
            messagebox.showwarning("提示", "请先在系统基本信息中添加子系统！")
            return

        # 为每个子系统创建测评区域
        for idx, subsystem_name in enumerate(subsystems):
            self.create_subsystem_app_section(parent, subsystem_name, idx)

        self.app_subsystems_loaded = True

    def create_subsystem_app_section(self, parent, subsystem_name, index):
        """为单个子系统创建应用和数据安全测评区域"""
        # 创建子系统主框架
        subsystem_frame = ttk.LabelFrame(parent, text=f"子系统：{subsystem_name}", padding=10)
        subsystem_frame.pack(fill=BOTH, expand=True, padx=10, pady=5)
        self.app_subsystem_frames[subsystem_name] = subsystem_frame

        # 一、身份鉴别与访问控制
        identity_frame = ttk.LabelFrame(subsystem_frame, text="一、身份鉴别与访问控制", padding=10)
        identity_frame.pack(fill=BOTH, expand=True, padx=5, pady=5)

        # 用户管理
        user_mgmt_frame = ttk.LabelFrame(identity_frame, text="用户管理", padding=10)
        user_mgmt_frame.pack(fill=BOTH, expand=True, padx=5, pady=5)

        # 添加用户按钮
        btn_frame = ttk.Frame(user_mgmt_frame)
        btn_frame.pack(fill=X, pady=5)
        ttk.Button(btn_frame, text="+ 添加用户", command=lambda: self.add_user(user_list_frame, subsystem_name)).pack(
            side=LEFT
        )

        # 用户列表容器
        user_list_frame = ttk.Frame(user_mgmt_frame)
        user_list_frame.pack(fill=BOTH, expand=True, pady=5)

        if not hasattr(self, "app_users"):
            self.app_users = {}
        if subsystem_name not in self.app_users:
            self.app_users[subsystem_name] = []

        # 统一身份认证机制说明（仅当有用户选择通过统一身份认证时显示）
        auth_mech_frame = ttk.LabelFrame(identity_frame, text="统一身份认证机制说明", padding=10)
        auth_mech_frame.pack(fill=BOTH, expand=True, padx=5, pady=5)
        ttk.Label(auth_mech_frame, text="说明（当有用户选择通过统一身份认证时填写）:").pack(anchor=W)
        auth_mech_text = scrolledtext.ScrolledText(auth_mech_frame, width=80, height=3)
        auth_mech_text.pack(fill=BOTH, expand=True, pady=5)

        if not hasattr(self, "app_auth_mechanisms"):
            self.app_auth_mechanisms = {}
        self.app_auth_mechanisms[subsystem_name] = auth_mech_text

        # 访问控制信息
        access_ctrl_frame = ttk.LabelFrame(identity_frame, text="访问控制信息", padding=10)
        access_ctrl_frame.pack(fill=BOTH, expand=True, padx=5, pady=5)

        # 存储完整性保护
        ttk.Label(access_ctrl_frame, text="是否进行存储完整性保护:").pack(anchor=W)
        storage_integrity_var = tk.BooleanVar(value=False)
        storage_integrity_cb = ttk.Checkbutton(access_ctrl_frame, text="是", variable=storage_integrity_var)
        storage_integrity_cb.pack(anchor=W)

        # 是否存储本系统
        ttk.Label(access_ctrl_frame, text="是否存储在本系统:").pack(anchor=W)
        stored_locally_var = tk.BooleanVar(value=True)

        # 非本地存储位置输入框（初始隐藏）
        storage_location_frame = ttk.Frame(access_ctrl_frame)
        storage_location_entry = None

        def toggle_storage_location(*args):
            nonlocal storage_location_entry
            if not stored_locally_var.get():
                storage_location_frame.pack(fill=X, pady=5)
                if storage_location_entry is None:
                    ttk.Label(storage_location_frame, text="存储位置:").pack(side=LEFT)
                    storage_location_entry = ttk.Entry(storage_location_frame, width=50)
                    storage_location_entry.pack(side=LEFT, padx=5)
            else:
                storage_location_frame.pack_forget()

        stored_locally_cb = ttk.Checkbutton(
            access_ctrl_frame, text="是", variable=stored_locally_var, command=toggle_storage_location
        )
        stored_locally_cb.pack(anchor=W)

        stored_locally_var.trace_add("write", toggle_storage_location)
        storage_location_frame.pack_forget()

        if not hasattr(self, "app_access_control"):
            self.app_access_control = {}
        self.app_access_control[subsystem_name] = {
            "storage_integrity": storage_integrity_var,
            "stored_locally": stored_locally_var,
            "storage_location": storage_location_entry,
        }

        # 密码产品管理
        crypto_prod_frame = ttk.LabelFrame(identity_frame, text="密码产品管理", padding=10)
        crypto_prod_frame.pack(fill=BOTH, expand=True, padx=5, pady=5)

        btn_frame = ttk.Frame(crypto_prod_frame)
        btn_frame.pack(fill=X, pady=5)
        ttk.Button(
            btn_frame,
            text="+ 添加密码产品",
            command=lambda: self.add_crypto_product_app(crypto_prod_list_frame, subsystem_name),
        ).pack(side=LEFT)

        crypto_prod_list_frame = ttk.Frame(crypto_prod_frame)
        crypto_prod_list_frame.pack(fill=BOTH, expand=True, pady=5)

        if not hasattr(self, "app_crypto_products"):
            self.app_crypto_products = {}
        if subsystem_name not in self.app_crypto_products:
            self.app_crypto_products[subsystem_name] = []

        # 密钥信息管理
        key_mgmt_frame = ttk.LabelFrame(identity_frame, text="密钥信息管理", padding=10)
        key_mgmt_frame.pack(fill=BOTH, expand=True, padx=5, pady=5)

        btn_frame = ttk.Frame(key_mgmt_frame)
        btn_frame.pack(fill=X, pady=5)
        ttk.Button(
            btn_frame, text="+ 添加密钥", command=lambda: self.add_key_info_app(key_list_frame, subsystem_name)
        ).pack(side=LEFT)

        key_list_frame = ttk.Frame(key_mgmt_frame)
        key_list_frame.pack(fill=BOTH, expand=True, pady=5)

        if not hasattr(self, "app_keys"):
            self.app_keys = {}
        if subsystem_name not in self.app_keys:
            self.app_keys[subsystem_name] = []

        # 二、重要数据的传输与存储
        data_frame = ttk.LabelFrame(subsystem_frame, text="二、重要数据的传输与存储", padding=10)
        data_frame.pack(fill=BOTH, expand=True, padx=5, pady=5)

        # 数据列表
        btn_frame = ttk.Frame(data_frame)
        btn_frame.pack(fill=X, pady=5)
        ttk.Button(
            btn_frame, text="+ 添加数据", command=lambda: self.add_data_item(data_list_frame, subsystem_name)
        ).pack(side=LEFT)

        data_list_frame = ttk.Frame(data_frame)
        data_list_frame.pack(fill=BOTH, expand=True, pady=5)

        if not hasattr(self, "app_data_items"):
            self.app_data_items = {}
        if subsystem_name not in self.app_data_items:
            self.app_data_items[subsystem_name] = []

        # 三、不可否认性
        nonrepudiation_frame = ttk.LabelFrame(subsystem_frame, text="三、不可否认性", padding=10)
        nonrepudiation_frame.pack(fill=BOTH, expand=True, padx=5, pady=5)

        # 不可否认性需求判断
        ttk.Label(nonrepudiation_frame, text="是否具有不可否认性需求:").pack(anchor=W)
        nonrepudiation_needed_var = tk.BooleanVar(value=False)

        # 业务场景容器（初始隐藏）
        business_scene_container = ttk.Frame(nonrepudiation_frame)

        def toggle_nonrepudiation_section(container, var):
            if var.get():
                container.pack(fill=BOTH, expand=True, pady=5)
            else:
                container.pack_forget()

        nonrepudiation_cb = ttk.Checkbutton(
            nonrepudiation_frame,
            text="是",
            variable=nonrepudiation_needed_var,
            command=lambda: toggle_nonrepudiation_section(business_scene_container, nonrepudiation_needed_var),
        )
        nonrepudiation_cb.pack(anchor=W)

        nonrepudiation_needed_var.trace_add(
            "write", lambda *args: toggle_nonrepudiation_section(business_scene_container, nonrepudiation_needed_var)
        )
        business_scene_container.pack_forget()

        # 业务场景列表
        btn_frame = ttk.Frame(business_scene_container)
        btn_frame.pack(fill=X, pady=5)
        ttk.Button(
            btn_frame,
            text="+ 添加业务场景",
            command=lambda: self.add_business_scene(business_scene_list_frame, subsystem_name),
        ).pack(side=LEFT)

        business_scene_list_frame = ttk.Frame(business_scene_container)
        business_scene_list_frame.pack(fill=BOTH, expand=True, pady=5)

        if not hasattr(self, "app_business_scenes"):
            self.app_business_scenes = {}
        if subsystem_name not in self.app_business_scenes:
            self.app_business_scenes[subsystem_name] = []

        if not hasattr(self, "app_nonrepudiation_needed"):
            self.app_nonrepudiation_needed = {}
        self.app_nonrepudiation_needed[subsystem_name] = nonrepudiation_needed_var

    def add_user(self, parent, subsystem_name):
        """添加用户"""
        user_frame = ttk.LabelFrame(parent, text=f"用户 {len(self.app_users[subsystem_name]) + 1}", padding=10)
        user_frame.pack(fill=BOTH, expand=True, pady=5)

        # 用户名
        ttk.Label(user_frame, text="用户名:").grid(row=0, column=0, sticky=W, pady=5)
        username_entry = ttk.Entry(user_frame, width=30)
        username_entry.grid(row=0, column=1, sticky=W, pady=5)

        # 鉴别方式
        ttk.Label(user_frame, text="鉴别方式:").grid(row=0, column=2, sticky=W, pady=5)
        auth_method_combo = ttk.Combobox(
            user_frame, values=["口令", "数字证书", "生物特征", "动态令牌", "多因素"], state="readonly", width=20
        )
        auth_method_combo.grid(row=0, column=3, sticky=W, pady=5)

        # 是否使用密码技术
        ttk.Label(user_frame, text="是否使用密码技术:").grid(row=1, column=0, sticky=W, pady=5)
        use_crypto_var = tk.BooleanVar(value=False)
        use_crypto_cb = ttk.Checkbutton(
            user_frame,
            text="是",
            variable=use_crypto_var,
            command=lambda: toggle_user_crypto_fields(crypto_fields_frame, use_crypto_var),
        )
        use_crypto_cb.grid(row=1, column=1, sticky=W, pady=5)

        # 是否通过统一身份认证
        ttk.Label(user_frame, text="是否通过统一身份认证:").grid(row=1, column=2, sticky=W, pady=5)
        use_unified_auth_var = tk.BooleanVar(value=False)
        use_unified_auth_cb = ttk.Checkbutton(user_frame, text="是", variable=use_unified_auth_var)
        use_unified_auth_cb.grid(row=1, column=3, sticky=W, pady=5)

        # 密码技术相关字段（初始隐藏）- 当选择已使用时不显示产品详情输入框
        crypto_fields_frame = ttk.Frame(user_frame)

        def toggle_user_crypto_fields(container, var):
            # 需求：某一用户选择已使用密码技术时，不需要弹出产品名称、厂商、证书编号、认证等级和使用用途输入框
            # 因此这里保持隐藏，不显示任何内容
            if var.get():
                # 可以选择显示提示信息，但不显示具体输入框
                pass
            container.grid_remove()

        use_crypto_var.trace_add("write", lambda *args: toggle_user_crypto_fields(crypto_fields_frame, use_crypto_var))
        crypto_fields_frame.grid_remove()

        # 删除按钮
        del_btn = ttk.Button(
            user_frame, text="× 删除此用户", command=lambda: self.remove_user(user_frame, subsystem_name)
        )
        del_btn.grid(row=0, column=4, sticky=E, pady=5)

        user_data = {
            "frame": user_frame,
            "username": username_entry,
            "auth_method": auth_method_combo,
            "use_crypto": use_crypto_var,
            "use_unified_auth": use_unified_auth_var,
            "crypto_product": None,  # 不再需要这些字段
        }

        self.app_users[subsystem_name].append(user_data)
        self.update_user_numbers(subsystem_name, parent)

    def remove_user(self, frame_to_remove, subsystem_name):
        """删除用户"""
        for i, user in enumerate(self.app_users[subsystem_name]):
            if user["frame"] == frame_to_remove:
                frame_to_remove.destroy()
                self.app_users[subsystem_name].pop(i)
                break
        self.update_user_numbers(subsystem_name, frame_to_remove.master)

    def update_user_numbers(self, subsystem_name, parent):
        """更新用户编号"""
        for i, user in enumerate(self.app_users[subsystem_name]):
            user["frame"].config(text=f"用户 {i + 1}")

    def add_crypto_product_app(self, parent, subsystem_name):
        """添加密码产品（用于身份鉴别与访问控制）"""
        prod_frame = ttk.LabelFrame(
            parent, text=f"密码产品 {len(self.app_crypto_products[subsystem_name]) + 1}", padding=10
        )
        prod_frame.pack(fill=BOTH, expand=True, pady=5)

        # 产品名称
        ttk.Label(prod_frame, text="产品名称:").grid(row=0, column=0, sticky=W, pady=5)
        name_entry = ttk.Entry(prod_frame, width=30)
        name_entry.grid(row=0, column=1, sticky=W, pady=5)

        # 厂商
        ttk.Label(prod_frame, text="厂商:").grid(row=0, column=2, sticky=W, pady=5)
        vendor_entry = ttk.Entry(prod_frame, width=20)
        vendor_entry.grid(row=0, column=3, sticky=W, pady=5)

        # 证书编号
        ttk.Label(prod_frame, text="证书编号:").grid(row=0, column=4, sticky=W, pady=5)
        cert_no_entry = ttk.Entry(prod_frame, width=15)
        cert_no_entry.grid(row=0, column=5, sticky=W, pady=5)

        # 认证等级
        ttk.Label(prod_frame, text="认证等级:").grid(row=1, column=0, sticky=W, pady=5)
        level_combo = ttk.Combobox(prod_frame, values=["一级", "二级", "三级"], state="readonly", width=10)
        level_combo.grid(row=1, column=1, sticky=W, pady=5)

        # 使用用途
        ttk.Label(prod_frame, text="使用用途:").grid(row=1, column=2, sticky=W, pady=5)
        usage_entry = ttk.Entry(prod_frame, width=30)
        usage_entry.grid(row=1, column=3, sticky=W, pady=5)

        # 删除按钮
        del_btn = ttk.Button(
            prod_frame, text="× 删除此产品", command=lambda: self.remove_crypto_product_app(prod_frame, subsystem_name)
        )
        del_btn.grid(row=0, column=6, sticky=E, pady=5)

        prod_data = {
            "frame": prod_frame,
            "name": name_entry,
            "vendor": vendor_entry,
            "cert_no": cert_no_entry,
            "level": level_combo,
            "usage": usage_entry,
        }

        self.app_crypto_products[subsystem_name].append(prod_data)
        self.update_crypto_product_numbers_app(subsystem_name, parent)

    def remove_crypto_product_app(self, frame_to_remove, subsystem_name):
        """删除密码产品"""
        for i, prod in enumerate(self.app_crypto_products[subsystem_name]):
            if prod["frame"] == frame_to_remove:
                frame_to_remove.destroy()
                self.app_crypto_products[subsystem_name].pop(i)
                break
        self.update_crypto_product_numbers_app(subsystem_name, frame_to_remove.master)

    def update_crypto_product_numbers_app(self, subsystem_name, parent):
        """更新密码产品编号"""
        for i, prod in enumerate(self.app_crypto_products[subsystem_name]):
            prod["frame"].config(text=f"密码产品 {i + 1}")

    def add_key_info_app(self, parent, subsystem_name):
        """添加密钥信息（用于身份鉴别与访问控制）"""
        key_frame = ttk.LabelFrame(parent, text=f"密钥 {len(self.app_keys[subsystem_name]) + 1}", padding=10)
        key_frame.pack(fill=BOTH, expand=True, pady=5)

        # 密钥名称
        ttk.Label(key_frame, text="密钥名称:").grid(row=0, column=0, sticky=W, pady=5)
        name_entry = ttk.Entry(key_frame, width=30)
        name_entry.grid(row=0, column=1, sticky=W, pady=5)

        # 密钥算法
        ttk.Label(key_frame, text="密钥算法:").grid(row=0, column=2, sticky=W, pady=5)
        algo_combo = ttk.Combobox(
            key_frame, values=["SM2", "SM3", "SM4", "RSA", "AES", "SHA-256"], state="readonly", width=15
        )
        algo_combo.grid(row=0, column=3, sticky=W, pady=5)

        # 密钥长度
        ttk.Label(key_frame, text="密钥长度:").grid(row=0, column=4, sticky=W, pady=5)
        length_entry = ttk.Entry(key_frame, width=10)
        length_entry.grid(row=0, column=5, sticky=W, pady=5)

        # 密钥生命周期描述
        ttk.Label(key_frame, text="密钥生命周期描述:").grid(row=1, column=0, sticky=W, pady=5)
        lifecycle_text = scrolledtext.ScrolledText(key_frame, width=50, height=3)
        lifecycle_text.grid(row=1, column=1, columnspan=5, sticky=W + E, pady=5)

        # 删除按钮
        del_btn = ttk.Button(
            key_frame, text="× 删除此密钥", command=lambda: self.remove_key_info_app(key_frame, subsystem_name)
        )
        del_btn.grid(row=0, column=6, sticky=E, pady=5)

        key_data = {
            "frame": key_frame,
            "name": name_entry,
            "algorithm": algo_combo,
            "length": length_entry,
            "lifecycle": lifecycle_text,
        }

        self.app_keys[subsystem_name].append(key_data)
        self.update_key_numbers_app(subsystem_name, parent)

    def remove_key_info_app(self, frame_to_remove, subsystem_name):
        """删除密钥信息"""
        for i, key in enumerate(self.app_keys[subsystem_name]):
            if key["frame"] == frame_to_remove:
                frame_to_remove.destroy()
                self.app_keys[subsystem_name].pop(i)
                break
        self.update_key_numbers_app(subsystem_name, frame_to_remove.master)

    def update_key_numbers_app(self, subsystem_name, parent):
        """更新密钥编号"""
        for i, key in enumerate(self.app_keys[subsystem_name]):
            key["frame"].config(text=f"密钥 {i + 1}")

    def add_data_item(self, parent, subsystem_name):
        """添加数据项（用于重要数据的传输与存储）"""
        data_index = len(self.app_data_items[subsystem_name]) + 1
        data_frame = ttk.LabelFrame(parent, text=f"数据 {data_index}", padding=10)
        data_frame.pack(fill=BOTH, expand=True, pady=5)

        # 数据名称
        ttk.Label(data_frame, text="数据名称:").grid(row=0, column=0, sticky=W, pady=5)
        name_entry = ttk.Entry(data_frame, width=30)
        name_entry.grid(row=0, column=1, sticky=W, pady=5)

        # 数据类型
        ttk.Label(data_frame, text="数据类型:").grid(row=0, column=2, sticky=W, pady=5)
        data_type_combo = ttk.Combobox(data_frame, values=["结构化", "非结构化"], state="readonly", width=15)
        data_type_combo.grid(row=0, column=3, sticky=W, pady=5)

        # 密码应用需求（多选）
        ttk.Label(data_frame, text="密码应用需求:").grid(row=1, column=0, sticky=W, pady=5)
        needs_frame = ttk.Frame(data_frame)
        needs_frame.grid(row=1, column=1, columnspan=4, sticky=W, pady=5)

        trans_conf_var = tk.BooleanVar(value=False)
        trans_int_var = tk.BooleanVar(value=False)
        store_conf_var = tk.BooleanVar(value=False)
        store_int_var = tk.BooleanVar(value=False)

        ttk.Checkbutton(
            needs_frame,
            text="传输机密性",
            variable=trans_conf_var,
            command=lambda: self.toggle_data_implementation(trans_conf_impl_frame, trans_conf_var),
        ).pack(side=LEFT, padx=5)
        ttk.Checkbutton(
            needs_frame,
            text="传输完整性",
            variable=trans_int_var,
            command=lambda: self.toggle_data_implementation(trans_int_impl_frame, trans_int_var),
        ).pack(side=LEFT, padx=5)
        ttk.Checkbutton(
            needs_frame,
            text="存储机密性",
            variable=store_conf_var,
            command=lambda: self.toggle_data_implementation(store_conf_impl_frame, store_conf_var),
        ).pack(side=LEFT, padx=5)
        ttk.Checkbutton(
            needs_frame,
            text="存储完整性",
            variable=store_int_var,
            command=lambda: self.toggle_data_implementation(store_int_impl_frame, store_int_var),
        ).pack(side=LEFT, padx=5)

        # 传输机密性实现机制
        trans_conf_impl_frame = ttk.LabelFrame(data_frame, text="传输机密性实现机制", padding=5)
        trans_conf_impl_frame.grid(row=2, column=0, columnspan=6, sticky=W + E, pady=5)
        trans_conf_impl_frame.grid_remove()  # 初始化隐藏

        # 创建实现机制表单的通用函数
        def create_impl_mechanism_form(parent_frame):
            impl_frame = ttk.Frame(parent_frame)
            impl_frame.pack(fill=BOTH, expand=True, pady=5)

            # 实现机制说明输入框
            ttk.Label(impl_frame, text="实现机制说明:").grid(row=0, column=0, sticky=W, pady=2)
            mech_text = scrolledtext.ScrolledText(impl_frame, width=60, height=2)
            mech_text.grid(row=0, column=1, columnspan=3, sticky=W + E, pady=2)

            # 是否使用合规密码技术
            compliant_tech_var = tk.BooleanVar(value=False)
            ttk.Checkbutton(impl_frame, text="使用合规密码技术", variable=compliant_tech_var).grid(
                row=1, column=0, sticky=W, pady=2
            )

            # 是否使用合规密码产品
            compliant_prod_var = tk.BooleanVar(value=False)
            ttk.Checkbutton(impl_frame, text="使用合规密码产品", variable=compliant_prod_var).grid(
                row=1, column=1, sticky=W, pady=2
            )

            # 实现算法
            ttk.Label(impl_frame, text="实现算法:").grid(row=2, column=0, sticky=W, pady=2)
            algo_entry = ttk.Entry(impl_frame, width=30)
            algo_entry.grid(row=2, column=1, sticky=W, pady=2)

            # 是否难以改造
            ttk.Label(impl_frame, text="是否难以改造:").grid(row=2, column=2, sticky=W, pady=2)
            hard_to_modify_var = tk.BooleanVar(value=False)
            hard_to_modify_cb = ttk.Checkbutton(
                impl_frame,
                text="是",
                variable=hard_to_modify_var,
                command=lambda: toggle_reason_field(reason_frame, hard_to_modify_var),
            )
            hard_to_modify_cb.grid(row=2, column=3, sticky=W, pady=2)

            # 难以改造原因
            reason_frame = ttk.Frame(impl_frame)

            def toggle_reason_field(container, var):
                if var.get():
                    container.grid(row=3, column=0, columnspan=4, sticky=W + E, pady=2)
                else:
                    container.grid_remove()

            hard_to_modify_var.trace_add("write", lambda *args: toggle_reason_field(reason_frame, hard_to_modify_var))
            reason_frame.grid_remove()

            ttk.Label(reason_frame, text="原因:").pack(side=LEFT)
            reason_text = scrolledtext.ScrolledText(reason_frame, width=60, height=2)
            reason_text.pack(fill=BOTH, expand=True)

            return {
                "mechanism": mech_text,
                "compliant_tech": compliant_tech_var,
                "compliant_prod": compliant_prod_var,
                "algorithm": algo_entry,
                "hard_to_modify": hard_to_modify_var,
                "reason": reason_text,
            }

        # 为每个实现机制创建表单
        trans_conf_impl_data = create_impl_mechanism_form(trans_conf_impl_frame)

        # 传输完整性实现机制
        trans_int_impl_frame = ttk.LabelFrame(data_frame, text="传输完整性实现机制", padding=5)
        trans_int_impl_frame.grid(row=3, column=0, columnspan=6, sticky=W + E, pady=5)
        trans_int_impl_frame.grid_remove()  # 初始化隐藏
        trans_int_impl_data = create_impl_mechanism_form(trans_int_impl_frame)

        # 存储机密性实现机制
        store_conf_impl_frame = ttk.LabelFrame(data_frame, text="存储机密性实现机制", padding=5)
        store_conf_impl_frame.grid(row=4, column=0, columnspan=6, sticky=W + E, pady=5)
        store_conf_impl_frame.grid_remove()  # 初始化隐藏
        store_conf_impl_data = create_impl_mechanism_form(store_conf_impl_frame)

        # 存储完整性实现机制
        store_int_impl_frame = ttk.LabelFrame(data_frame, text="存储完整性实现机制", padding=5)
        store_int_impl_frame.grid(row=5, column=0, columnspan=6, sticky=W + E, pady=5)
        store_int_impl_frame.grid_remove()  # 初始化隐藏
        store_int_impl_data = create_impl_mechanism_form(store_int_impl_frame)

        # 密码产品管理（针对此数据）- 始终显示，无论是否有需求被选中
        crypto_prod_frame = ttk.LabelFrame(data_frame, text="密码产品管理", padding=5)
        crypto_prod_frame.grid(row=2, column=0, columnspan=6, sticky=W + E, pady=5)

        crypto_prod_list_frame = ttk.Frame(crypto_prod_frame)
        crypto_prod_list_frame.pack(fill=BOTH, expand=True, pady=5)

        ttk.Button(
            crypto_prod_frame,
            text="+ 添加密码产品",
            command=lambda: self.add_crypto_product_for_data(crypto_prod_list_frame, subsystem_name, data_frame),
        ).pack(pady=5)

        if not hasattr(self, "app_data_crypto_products"):
            self.app_data_crypto_products = {}
        key = (subsystem_name, data_frame)
        if key not in self.app_data_crypto_products:
            self.app_data_crypto_products[key] = []

        # 密钥信息管理（针对此数据）- 始终显示，无论是否有需求被选中
        key_mgmt_frame = ttk.LabelFrame(data_frame, text="密钥信息管理", padding=5)
        key_mgmt_frame.grid(row=3, column=0, columnspan=6, sticky=W + E, pady=5)

        key_list_frame = ttk.Frame(key_mgmt_frame)
        key_list_frame.pack(fill=BOTH, expand=True, pady=5)

        ttk.Button(
            key_mgmt_frame,
            text="+ 添加密钥",
            command=lambda: self.add_key_for_data(key_list_frame, subsystem_name, data_frame),
        ).pack(pady=5)

        if not hasattr(self, "app_data_keys"):
            self.app_data_keys = {}
        if key not in self.app_data_keys:
            self.app_data_keys[key] = []

        # 删除按钮
        del_btn = ttk.Button(
            data_frame, text="× 删除此数据", command=lambda: self.remove_data_item(data_frame, subsystem_name)
        )
        del_btn.grid(row=0, column=4, sticky=E, pady=5)

        data_obj = {
            "frame": data_frame,
            "name": name_entry,
            "type": data_type_combo,
            "needs": {
                "trans_confidentiality": trans_conf_var,
                "trans_integrity": trans_int_var,
                "store_confidentiality": store_conf_var,
                "store_integrity": store_int_var,
            },
            "implementations": {
                "trans_confidentiality": trans_conf_impl_data,
                "trans_integrity": trans_int_impl_data,
                "store_confidentiality": store_conf_impl_data,
                "store_integrity": store_int_impl_data,
            },
            "crypto_products_frame": crypto_prod_list_frame,
            "keys_frame": key_list_frame,
        }

        self.app_data_items[subsystem_name].append(data_obj)
        self.update_data_item_numbers(subsystem_name, parent)

    def toggle_data_implementation(self, impl_frame, var):
        """切换数据实现机制显示"""
        if var.get():
            # 获取当前 frame 的 grid_info 来获取预设的行号
            info = impl_frame.grid_info()
            if info and "row" in info:
                row = info["row"]
            else:
                row = self.get_next_grid_row(impl_frame.master)
            impl_frame.grid(row=row, column=0, columnspan=6, sticky=W + E, pady=5)
        else:
            impl_frame.grid_remove()

        # 当有任何一个密码应用需求被选中时，确保密码产品管理和密钥信息管理显示在所有实现机制之后
        parent = impl_frame.master
        self.adjust_crypto_and_key_mgmt_positions(parent)

    def adjust_crypto_and_key_mgmt_positions(self, parent):
        """调整密码产品管理和密钥信息管理的位置，使其显示在所有已选中的实现机制之后"""
        # 查找所有实现机制框架和密码产品管理、密钥信息管理框架
        impl_frames = {}  # 存储框架和对应的行号

        for widget in parent.winfo_children():
            if isinstance(widget, ttk.LabelFrame):
                text = widget.cget("text")
                if "传输机密性实现机制" in text:
                    impl_frames["trans_conf"] = {"frame": widget, "row": 2}
                elif "传输完整性实现机制" in text:
                    impl_frames["trans_int"] = {"frame": widget, "row": 3}
                elif "存储机密性实现机制" in text:
                    impl_frames["store_conf"] = {"frame": widget, "row": 4}
                elif "存储完整性实现机制" in text:
                    impl_frames["store_int"] = {"frame": widget, "row": 5}
                elif "密码产品管理" in text and "针对此数据" not in text:
                    # 只处理数据层面的密码产品管理，不处理其他层面的
                    continue
                elif "密码产品管理" in text:
                    impl_frames["crypto_prod"] = {"frame": widget}
                elif "密钥信息管理" in text:
                    impl_frames["key_mgmt"] = {"frame": widget}

        # 通过直接检查复选框的状态来判断哪些需求被选中，以及哪些实现机制当前是显示的
        selected_rows = []
        for widget in parent.winfo_children():
            if isinstance(widget, ttk.LabelFrame):
                text = widget.cget("text")
                # 检查实现机制框架是否显示（没有被 grid_remove）
                if "传输机密性实现机制" in text and widget.winfo_viewable():
                    selected_rows.append(2)
                elif "传输完整性实现机制" in text and widget.winfo_viewable():
                    selected_rows.append(3)
                elif "存储机密性实现机制" in text and widget.winfo_viewable():
                    selected_rows.append(4)
                elif "存储完整性实现机制" in text and widget.winfo_viewable():
                    selected_rows.append(5)

        # 计算所有显示的实现机制的最大行号
        # 如果没有显示任何实现机制，则从第 1 行开始（密码应用需求在第 0 行）
        max_row = max(selected_rows) if selected_rows else 1

        # 将密码产品管理和密钥信息管理放置在所有实现机制之后
        # 无论是否有需求被选中，均显示密码产品管理和密钥管理功能
        if "crypto_prod" in impl_frames and impl_frames["crypto_prod"]["frame"]:
            impl_frames["crypto_prod"]["frame"].grid(row=max_row + 1, column=0, columnspan=6, sticky=W + E, pady=5)

        if "key_mgmt" in impl_frames and impl_frames["key_mgmt"]["frame"]:
            impl_frames["key_mgmt"]["frame"].grid(row=max_row + 2, column=0, columnspan=6, sticky=W + E, pady=5)

    def get_next_grid_row(self, parent):
        """获取下一个可用的网格行号"""
        max_row = -1
        for widget in parent.winfo_children():
            info = widget.grid_info()
            if info and "row" in info:
                max_row = max(max_row, info["row"])
        return max_row + 1

    def add_crypto_product_for_data(self, parent, subsystem_name, data_frame):
        """为数据项添加密码产品"""
        key = (subsystem_name, data_frame)
        prod_index = len(self.app_data_crypto_products.get(key, [])) + 1
        prod_frame = ttk.LabelFrame(parent, text=f"密码产品 {prod_index}", padding=5)
        prod_frame.pack(fill=BOTH, expand=True, pady=3)

        # 产品名称
        ttk.Label(prod_frame, text="产品名称:").grid(row=0, column=0, sticky=W, pady=2)
        name_entry = ttk.Entry(prod_frame, width=20)
        name_entry.grid(row=0, column=1, sticky=W, pady=2)

        # 厂商
        ttk.Label(prod_frame, text="厂商:").grid(row=0, column=2, sticky=W, pady=2)
        vendor_entry = ttk.Entry(prod_frame, width=15)
        vendor_entry.grid(row=0, column=3, sticky=W, pady=2)

        # 证书编号
        ttk.Label(prod_frame, text="证书编号:").grid(row=0, column=4, sticky=W, pady=2)
        cert_no_entry = ttk.Entry(prod_frame, width=12)
        cert_no_entry.grid(row=0, column=5, sticky=W, pady=2)

        # 认证等级
        ttk.Label(prod_frame, text="认证等级:").grid(row=1, column=0, sticky=W, pady=2)
        level_combo = ttk.Combobox(prod_frame, values=["一级", "二级", "三级"], state="readonly", width=8)
        level_combo.grid(row=1, column=1, sticky=W, pady=2)

        # 使用用途
        ttk.Label(prod_frame, text="使用用途:").grid(row=1, column=2, sticky=W, pady=2)
        usage_entry = ttk.Entry(prod_frame, width=20)
        usage_entry.grid(row=1, column=3, sticky=W, pady=2)

        # 删除按钮
        del_btn = ttk.Button(
            prod_frame,
            text="×",
            width=2,
            command=lambda: self.remove_crypto_product_for_data(prod_frame, subsystem_name, data_frame),
        )
        del_btn.grid(row=0, column=6, sticky=E, pady=2)

        prod_data = {
            "frame": prod_frame,
            "name": name_entry,
            "vendor": vendor_entry,
            "cert_no": cert_no_entry,
            "level": level_combo,
            "usage": usage_entry,
        }

        if key not in self.app_data_crypto_products:
            self.app_data_crypto_products[key] = []
        self.app_data_crypto_products[key].append(prod_data)
        self.update_crypto_product_for_data_numbers(subsystem_name, data_frame, parent)

    def remove_crypto_product_for_data(self, frame_to_remove, subsystem_name, data_frame):
        """删除数据项的密码产品"""
        key = (subsystem_name, data_frame)
        for i, prod in enumerate(self.app_data_crypto_products.get(key, [])):
            if prod["frame"] == frame_to_remove:
                frame_to_remove.destroy()
                self.app_data_crypto_products[key].pop(i)
                break
        self.update_crypto_product_for_data_numbers(subsystem_name, data_frame, frame_to_remove.master)

    def update_crypto_product_for_data_numbers(self, subsystem_name, data_frame, parent):
        """更新数据项密码产品编号"""
        key = (subsystem_name, data_frame)
        for i, prod in enumerate(self.app_data_crypto_products.get(key, [])):
            prod["frame"].config(text=f"密码产品 {i + 1}")

    def add_key_for_data(self, parent, subsystem_name, data_frame):
        """为数据项添加密钥信息"""
        key_tuple = (subsystem_name, data_frame)
        key_index = len(self.app_data_keys.get(key_tuple, [])) + 1
        key_frame = ttk.LabelFrame(parent, text=f"密钥 {key_index}", padding=5)
        key_frame.pack(fill=BOTH, expand=True, pady=3)

        # 密钥名称
        ttk.Label(key_frame, text="密钥名称:").grid(row=0, column=0, sticky=W, pady=2)
        name_entry = ttk.Entry(key_frame, width=20)
        name_entry.grid(row=0, column=1, sticky=W, pady=2)

        # 密钥算法
        ttk.Label(key_frame, text="密钥算法:").grid(row=0, column=2, sticky=W, pady=2)
        algo_combo = ttk.Combobox(
            key_frame, values=["SM2", "SM3", "SM4", "RSA", "AES", "SHA-256"], state="readonly", width=12
        )
        algo_combo.grid(row=0, column=3, sticky=W, pady=2)

        # 密钥长度
        ttk.Label(key_frame, text="密钥长度:").grid(row=0, column=4, sticky=W, pady=2)
        length_entry = ttk.Entry(key_frame, width=8)
        length_entry.grid(row=0, column=5, sticky=W, pady=2)

        # 密钥生命周期描述
        ttk.Label(key_frame, text="密钥生命周期描述:").grid(row=1, column=0, sticky=W, pady=2)
        lifecycle_text = scrolledtext.ScrolledText(key_frame, width=50, height=2)
        lifecycle_text.grid(row=1, column=1, columnspan=5, sticky=W + E, pady=2)

        # 删除按钮
        del_btn = ttk.Button(
            key_frame,
            text="×",
            width=2,
            command=lambda: self.remove_key_for_data(key_frame, subsystem_name, data_frame),
        )
        del_btn.grid(row=0, column=6, sticky=E, pady=2)

        key_data = {
            "frame": key_frame,
            "name": name_entry,
            "algorithm": algo_combo,
            "length": length_entry,
            "lifecycle": lifecycle_text,
        }

        if key_tuple not in self.app_data_keys:
            self.app_data_keys[key_tuple] = []
        self.app_data_keys[key_tuple].append(key_data)
        self.update_key_for_data_numbers(subsystem_name, data_frame, parent)

    def remove_key_for_data(self, frame_to_remove, subsystem_name, data_frame):
        """删除数据项的密钥"""
        key_tuple = (subsystem_name, data_frame)
        for i, key in enumerate(self.app_data_keys.get(key_tuple, [])):
            if key["frame"] == frame_to_remove:
                frame_to_remove.destroy()
                self.app_data_keys[key_tuple].pop(i)
                break
        self.update_key_for_data_numbers(subsystem_name, data_frame, frame_to_remove.master)

    def update_key_for_data_numbers(self, subsystem_name, data_frame, parent):
        """更新数据项密钥编号"""
        key_tuple = (subsystem_name, data_frame)
        for i, key in enumerate(self.app_data_keys.get(key_tuple, [])):
            key["frame"].config(text=f"密钥 {i + 1}")

    def remove_data_item(self, frame_to_remove, subsystem_name):
        """删除数据项"""
        for i, data in enumerate(self.app_data_items[subsystem_name]):
            if data["frame"] == frame_to_remove:
                # 清理关联的密码产品和密钥
                key = (subsystem_name, frame_to_remove)
                if key in self.app_data_crypto_products:
                    for prod in self.app_data_crypto_products[key]:
                        prod["frame"].destroy()
                    del self.app_data_crypto_products[key]
                if key in self.app_data_keys:
                    for k in self.app_data_keys[key]:
                        k["frame"].destroy()
                    del self.app_data_keys[key]

                frame_to_remove.destroy()
                self.app_data_items[subsystem_name].pop(i)
                break
        self.update_data_item_numbers(subsystem_name, frame_to_remove.master)

    def update_data_item_numbers(self, subsystem_name, parent):
        """更新数据项编号"""
        for i, data in enumerate(self.app_data_items[subsystem_name]):
            data["frame"].config(text=f"数据 {i + 1}")

    def add_business_scene(self, parent, subsystem_name):
        """添加业务场景（用于不可否认性）"""
        scene_index = len(self.app_business_scenes[subsystem_name]) + 1
        scene_frame = ttk.LabelFrame(parent, text=f"业务场景 {scene_index}", padding=10)
        scene_frame.pack(fill=BOTH, expand=True, pady=5)

        # 业务场景名称
        ttk.Label(scene_frame, text="业务场景名称:").grid(row=0, column=0, sticky=W, pady=5)
        name_entry = ttk.Entry(scene_frame, width=40)
        name_entry.grid(row=0, column=1, sticky=W, pady=5)

        # 是否实现不可否认性
        ttk.Label(scene_frame, text="是否实现不可否认性:").grid(row=0, column=2, sticky=W, pady=5)
        implemented_var = tk.BooleanVar(value=False)
        implemented_cb = ttk.Checkbutton(
            scene_frame,
            text="是",
            variable=implemented_var,
            command=lambda: toggle_scene_implementation(impl_frame, implemented_var),
        )
        implemented_cb.grid(row=0, column=3, sticky=W, pady=5)

        # 实现机制说明（初始隐藏）
        impl_frame = ttk.LabelFrame(scene_frame, text="实现机制说明", padding=5)

        def toggle_scene_implementation(container, var):
            if var.get():
                container.grid(row=1, column=0, columnspan=6, sticky=W + E, pady=5)
            else:
                container.grid_remove()

        implemented_var.trace_add("write", lambda *args: toggle_scene_implementation(impl_frame, implemented_var))
        impl_frame.grid_remove()

        # 实现机制内容
        ttk.Label(impl_frame, text="机制说明:").grid(row=0, column=0, sticky=W, pady=2)
        mech_text = scrolledtext.ScrolledText(impl_frame, width=60, height=2)
        mech_text.grid(row=0, column=1, columnspan=3, sticky=W + E, pady=2)

        # 是否使用合规密码技术
        compliant_tech_var = tk.BooleanVar(value=False)
        ttk.Checkbutton(impl_frame, text="使用合规密码技术", variable=compliant_tech_var).grid(
            row=1, column=0, sticky=W, pady=2
        )

        # 是否使用合规密码产品
        compliant_prod_var = tk.BooleanVar(value=False)
        ttk.Checkbutton(impl_frame, text="使用合规密码产品", variable=compliant_prod_var).grid(
            row=1, column=1, sticky=W, pady=2
        )

        # 实现算法
        ttk.Label(impl_frame, text="实现算法:").grid(row=1, column=2, sticky=W, pady=2)
        algo_entry = ttk.Entry(impl_frame, width=20)
        algo_entry.grid(row=1, column=3, sticky=W, pady=2)

        # 签名保护范围
        ttk.Label(scene_frame, text="签名保护范围:").grid(row=2, column=0, sticky=W, pady=5)
        scope_entry = ttk.Entry(scene_frame, width=50)
        scope_entry.grid(row=2, column=1, columnspan=3, sticky=W, pady=5)

        # 防重放机制
        ttk.Label(scene_frame, text="防重放机制:").grid(row=3, column=0, sticky=W, pady=5)
        anti_replay_var = tk.StringVar(value="不具备")
        anti_replay_combo = ttk.Combobox(
            scene_frame, values=["具备", "不具备"], textvariable=anti_replay_var, state="readonly", width=15
        )
        anti_replay_combo.grid(row=3, column=1, sticky=W, pady=5)
        anti_replay_combo.bind(
            "<<ComboboxSelected>>", lambda e: toggle_anti_replay_reason(anti_replay_frame, anti_replay_var)
        )

        # 防重放机制说明（初始隐藏）
        anti_replay_frame = ttk.Frame(scene_frame)

        def toggle_anti_replay_reason(container, var):
            if var.get() == "具备":
                container.grid(row=4, column=0, columnspan=6, sticky=W + E, pady=5)
            else:
                container.grid_remove()

        anti_replay_var.trace_add("write", lambda *args: toggle_anti_replay_reason(anti_replay_frame, anti_replay_var))
        if anti_replay_var.get() != "具备":
            anti_replay_frame.grid_remove()

        ttk.Label(anti_replay_frame, text="机制说明:").pack(side=LEFT)
        anti_replay_text = scrolledtext.ScrolledText(anti_replay_frame, width=60, height=2)
        anti_replay_text.pack(fill=BOTH, expand=True)

        # 密码产品管理（针对此业务场景）
        crypto_prod_frame = ttk.LabelFrame(scene_frame, text="密码产品管理", padding=5)
        crypto_prod_frame.grid(row=5, column=0, columnspan=6, sticky=W + E, pady=5)

        crypto_prod_list_frame = ttk.Frame(crypto_prod_frame)
        crypto_prod_list_frame.pack(fill=BOTH, expand=True, pady=5)

        ttk.Button(
            crypto_prod_frame,
            text="+ 添加密码产品",
            command=lambda: self.add_crypto_product_for_scene(crypto_prod_list_frame, subsystem_name, scene_frame),
        ).pack(pady=5)

        if not hasattr(self, "app_scene_crypto_products"):
            self.app_scene_crypto_products = {}
        key = (subsystem_name, scene_frame)
        if key not in self.app_scene_crypto_products:
            self.app_scene_crypto_products[key] = []

        # 密钥信息管理（针对此业务场景）
        key_mgmt_frame = ttk.LabelFrame(scene_frame, text="密钥信息管理", padding=5)
        key_mgmt_frame.grid(row=6, column=0, columnspan=6, sticky=W + E, pady=5)

        key_list_frame = ttk.Frame(key_mgmt_frame)
        key_list_frame.pack(fill=BOTH, expand=True, pady=5)

        ttk.Button(
            key_mgmt_frame,
            text="+ 添加密钥",
            command=lambda: self.add_key_for_scene(key_list_frame, subsystem_name, scene_frame),
        ).pack(pady=5)

        if not hasattr(self, "app_scene_keys"):
            self.app_scene_keys = {}
        if key not in self.app_scene_keys:
            self.app_scene_keys[key] = []

        # 删除按钮
        del_btn = ttk.Button(
            scene_frame,
            text="× 删除此业务场景",
            command=lambda: self.remove_business_scene(scene_frame, subsystem_name),
        )
        del_btn.grid(row=0, column=4, sticky=E, pady=5)

        scene_data = {
            "frame": scene_frame,
            "name": name_entry,
            "implemented": implemented_var,
            "implementation": {
                "mechanism": mech_text,
                "compliant_tech": compliant_tech_var,
                "compliant_prod": compliant_prod_var,
                "algorithm": algo_entry,
            },
            "scope": scope_entry,
            "anti_replay": anti_replay_var,
            "anti_replay_text": anti_replay_text,
            "crypto_products_frame": crypto_prod_list_frame,
            "keys_frame": key_list_frame,
        }

        self.app_business_scenes[subsystem_name].append(scene_data)
        self.update_business_scene_numbers(subsystem_name, parent)

    def add_crypto_product_for_scene(self, parent, subsystem_name, scene_frame):
        """为业务场景添加密码产品"""
        key = (subsystem_name, scene_frame)
        prod_index = len(self.app_scene_crypto_products.get(key, [])) + 1
        prod_frame = ttk.LabelFrame(parent, text=f"密码产品 {prod_index}", padding=5)
        prod_frame.pack(fill=BOTH, expand=True, pady=3)

        # 产品名称
        ttk.Label(prod_frame, text="产品名称:").grid(row=0, column=0, sticky=W, pady=2)
        name_entry = ttk.Entry(prod_frame, width=20)
        name_entry.grid(row=0, column=1, sticky=W, pady=2)

        # 厂商
        ttk.Label(prod_frame, text="厂商:").grid(row=0, column=2, sticky=W, pady=2)
        vendor_entry = ttk.Entry(prod_frame, width=15)
        vendor_entry.grid(row=0, column=3, sticky=W, pady=2)

        # 证书编号
        ttk.Label(prod_frame, text="证书编号:").grid(row=0, column=4, sticky=W, pady=2)
        cert_no_entry = ttk.Entry(prod_frame, width=12)
        cert_no_entry.grid(row=0, column=5, sticky=W, pady=2)

        # 认证等级
        ttk.Label(prod_frame, text="认证等级:").grid(row=1, column=0, sticky=W, pady=2)
        level_combo = ttk.Combobox(prod_frame, values=["一级", "二级", "三级"], state="readonly", width=8)
        level_combo.grid(row=1, column=1, sticky=W, pady=2)

        # 使用用途
        ttk.Label(prod_frame, text="使用用途:").grid(row=1, column=2, sticky=W, pady=2)
        usage_entry = ttk.Entry(prod_frame, width=20)
        usage_entry.grid(row=1, column=3, sticky=W, pady=2)

        # 删除按钮
        del_btn = ttk.Button(
            prod_frame,
            text="×",
            width=2,
            command=lambda: self.remove_crypto_product_for_scene(prod_frame, subsystem_name, scene_frame),
        )
        del_btn.grid(row=0, column=6, sticky=E, pady=2)

        prod_data = {
            "frame": prod_frame,
            "name": name_entry,
            "vendor": vendor_entry,
            "cert_no": cert_no_entry,
            "level": level_combo,
            "usage": usage_entry,
        }

        if key not in self.app_scene_crypto_products:
            self.app_scene_crypto_products[key] = []
        self.app_scene_crypto_products[key].append(prod_data)
        self.update_crypto_product_for_scene_numbers(subsystem_name, scene_frame, parent)

    def remove_crypto_product_for_scene(self, frame_to_remove, subsystem_name, scene_frame):
        """删除业务场景的密码产品"""
        key = (subsystem_name, scene_frame)
        for i, prod in enumerate(self.app_scene_crypto_products.get(key, [])):
            if prod["frame"] == frame_to_remove:
                frame_to_remove.destroy()
                self.app_scene_crypto_products[key].pop(i)
                break
        self.update_crypto_product_for_scene_numbers(subsystem_name, scene_frame, frame_to_remove.master)

    def update_crypto_product_for_scene_numbers(self, subsystem_name, scene_frame, parent):
        """更新业务场景密码产品编号"""
        key = (subsystem_name, scene_frame)
        for i, prod in enumerate(self.app_scene_crypto_products.get(key, [])):
            prod["frame"].config(text=f"密码产品 {i + 1}")

    def add_key_for_scene(self, parent, subsystem_name, scene_frame):
        """为业务场景添加密钥信息"""
        key_tuple = (subsystem_name, scene_frame)
        key_index = len(self.app_scene_keys.get(key_tuple, [])) + 1
        key_frame = ttk.LabelFrame(parent, text=f"密钥 {key_index}", padding=5)
        key_frame.pack(fill=BOTH, expand=True, pady=3)

        # 密钥名称
        ttk.Label(key_frame, text="密钥名称:").grid(row=0, column=0, sticky=W, pady=2)
        name_entry = ttk.Entry(key_frame, width=20)
        name_entry.grid(row=0, column=1, sticky=W, pady=2)

        # 密钥算法
        ttk.Label(key_frame, text="密钥算法:").grid(row=0, column=2, sticky=W, pady=2)
        algo_combo = ttk.Combobox(
            key_frame, values=["SM2", "SM3", "SM4", "RSA", "AES", "SHA-256"], state="readonly", width=12
        )
        algo_combo.grid(row=0, column=3, sticky=W, pady=2)

        # 密钥长度
        ttk.Label(key_frame, text="密钥长度:").grid(row=0, column=4, sticky=W, pady=2)
        length_entry = ttk.Entry(key_frame, width=8)
        length_entry.grid(row=0, column=5, sticky=W, pady=2)

        # 密钥生命周期描述
        ttk.Label(key_frame, text="密钥生命周期描述:").grid(row=1, column=0, sticky=W, pady=2)
        lifecycle_text = scrolledtext.ScrolledText(key_frame, width=50, height=2)
        lifecycle_text.grid(row=1, column=1, columnspan=5, sticky=W + E, pady=2)

        # 删除按钮
        del_btn = ttk.Button(
            key_frame,
            text="×",
            width=2,
            command=lambda: self.remove_key_for_scene(key_frame, subsystem_name, scene_frame),
        )
        del_btn.grid(row=0, column=6, sticky=E, pady=2)

        key_data = {
            "frame": key_frame,
            "name": name_entry,
            "algorithm": algo_combo,
            "length": length_entry,
            "lifecycle": lifecycle_text,
        }

        if key_tuple not in self.app_scene_keys:
            self.app_scene_keys[key_tuple] = []
        self.app_scene_keys[key_tuple].append(key_data)
        self.update_key_for_scene_numbers(subsystem_name, scene_frame, parent)

    def remove_key_for_scene(self, frame_to_remove, subsystem_name, scene_frame):
        """删除业务场景的密钥"""
        key_tuple = (subsystem_name, scene_frame)
        for i, key in enumerate(self.app_scene_keys.get(key_tuple, [])):
            if key["frame"] == frame_to_remove:
                frame_to_remove.destroy()
                self.app_scene_keys[key_tuple].pop(i)
                break
        self.update_key_for_scene_numbers(subsystem_name, scene_frame, frame_to_remove.master)

    def update_key_for_scene_numbers(self, subsystem_name, scene_frame, parent):
        """更新业务场景密钥编号"""
        key_tuple = (subsystem_name, scene_frame)
        for i, key in enumerate(self.app_scene_keys.get(key_tuple, [])):
            key["frame"].config(text=f"密钥 {i + 1}")

    def remove_business_scene(self, frame_to_remove, subsystem_name):
        """删除业务场景"""
        for i, scene in enumerate(self.app_business_scenes[subsystem_name]):
            if scene["frame"] == frame_to_remove:
                # 清理关联的密码产品和密钥
                key = (subsystem_name, frame_to_remove)
                if key in self.app_scene_crypto_products:
                    for prod in self.app_scene_crypto_products[key]:
                        prod["frame"].destroy()
                    del self.app_scene_crypto_products[key]
                if key in self.app_scene_keys:
                    for k in self.app_scene_keys[key]:
                        k["frame"].destroy()
                    del self.app_scene_keys[key]

                frame_to_remove.destroy()
                self.app_business_scenes[subsystem_name].pop(i)
                break
        self.update_business_scene_numbers(subsystem_name, frame_to_remove.master)

    def update_business_scene_numbers(self, subsystem_name, parent):
        """更新业务场景编号"""
        for i, scene in enumerate(self.app_business_scenes[subsystem_name]):
            scene["frame"].config(text=f"业务场景 {i + 1}")

    def save_application_security_data(self):
        """保存应用和数据安全数据"""
        app_security_data = {}

        for subsystem_name in self.app_subsystem_frames.keys():
            subsystem_data = {"identity_access_control": {}, "data_transmission_storage": [], "nonrepudiation": {}}

            # 保存身份鉴别与访问控制数据
            identity_data = subsystem_data["identity_access_control"]

            # 用户数据
            users = []
            if subsystem_name in self.app_users:
                for user in self.app_users[subsystem_name]:
                    user_data = {
                        "username": user["username"].get(),
                        "auth_method": user["auth_method"].get(),
                        "use_crypto": user["use_crypto"].get(),
                        "use_unified_auth": user["use_unified_auth"].get(),
                    }
                    if user["use_crypto"].get():
                        user_data["crypto_product"] = {
                            "name": user["crypto_product"]["name"].get(),
                            "vendor": user["crypto_product"]["vendor"].get(),
                            "cert_no": user["crypto_product"]["cert_no"].get(),
                            "level": user["crypto_product"]["level"].get(),
                            "usage": user["crypto_product"]["usage"].get(),
                        }
                    users.append(user_data)
            identity_data["users"] = users

            # 统一身份认证机制说明
            if subsystem_name in self.app_auth_mechanisms:
                identity_data["unified_auth_mechanism"] = (
                    self.app_auth_mechanisms[subsystem_name].get("1.0", END).strip()
                )

            # 访问控制信息
            if subsystem_name in self.app_access_control:
                ac = self.app_access_control[subsystem_name]
                identity_data["access_control"] = {
                    "storage_integrity": ac["storage_integrity"].get(),
                    "stored_locally": ac["stored_locally"].get(),
                }
                if not ac["stored_locally"].get() and ac["storage_location"]:
                    identity_data["access_control"]["storage_location"] = ac["storage_location"].get()

            # 密码产品
            crypto_products = []
            if subsystem_name in self.app_crypto_products:
                for prod in self.app_crypto_products[subsystem_name]:
                    crypto_products.append(
                        {
                            "name": prod["name"].get(),
                            "vendor": prod["vendor"].get(),
                            "cert_no": prod["cert_no"].get(),
                            "level": prod["level"].get(),
                            "usage": prod["usage"].get(),
                        }
                    )
            identity_data["crypto_products"] = crypto_products

            # 密钥信息
            keys = []
            if subsystem_name in self.app_keys:
                for key in self.app_keys[subsystem_name]:
                    keys.append(
                        {
                            "name": key["name"].get(),
                            "algorithm": key["algorithm"].get(),
                            "length": key["length"].get(),
                            "lifecycle": key["lifecycle"].get("1.0", END).strip(),
                        }
                    )
            identity_data["keys"] = keys

            # 保存重要数据的传输与存储数据
            data_items = []
            if subsystem_name in self.app_data_items:
                for data_item in self.app_data_items[subsystem_name]:
                    item_data = {
                        "name": data_item["name"].get(),
                        "type": data_item["type"].get(),
                        "needs": {
                            "trans_confidentiality": data_item["needs"]["trans_confidentiality"].get(),
                            "trans_integrity": data_item["needs"]["trans_integrity"].get(),
                            "store_confidentiality": data_item["needs"]["store_confidentiality"].get(),
                            "store_integrity": data_item["needs"]["store_integrity"].get(),
                        },
                        "implementations": {},
                    }

                    # 实现机制
                    for need_key, impl_key in [
                        ("trans_confidentiality", "trans_confidentiality"),
                        ("trans_integrity", "trans_integrity"),
                        ("store_confidentiality", "store_confidentiality"),
                        ("store_integrity", "store_integrity"),
                    ]:
                        if data_item["needs"][need_key].get():
                            impl = data_item["implementations"][impl_key]
                            item_data["implementations"][impl_key] = {
                                "mechanism": impl["mechanism"].get("1.0", END).strip(),
                                "compliant_tech": impl["compliant_tech"].get(),
                                "compliant_prod": impl["compliant_prod"].get(),
                                "algorithm": impl["algorithm"].get(),
                                "hard_to_modify": impl["hard_to_modify"].get(),
                            }
                            if impl["hard_to_modify"].get():
                                item_data["implementations"][impl_key]["reason"] = (
                                    impl["reason"].get("1.0", END).strip()
                                )

                    # 密码产品
                    key = (subsystem_name, data_item["frame"])
                    data_crypto_prods = []
                    if key in self.app_data_crypto_products:
                        for prod in self.app_data_crypto_products[key]:
                            data_crypto_prods.append(
                                {
                                    "name": prod["name"].get(),
                                    "vendor": prod["vendor"].get(),
                                    "cert_no": prod["cert_no"].get(),
                                    "level": prod["level"].get(),
                                    "usage": prod["usage"].get(),
                                }
                            )
                    item_data["crypto_products"] = data_crypto_prods

                    # 密钥信息
                    data_keys = []
                    if key in self.app_data_keys:
                        for k in self.app_data_keys[key]:
                            data_keys.append(
                                {
                                    "name": k["name"].get(),
                                    "algorithm": k["algorithm"].get(),
                                    "length": k["length"].get(),
                                    "lifecycle": k["lifecycle"].get("1.0", END).strip(),
                                }
                            )
                    item_data["keys"] = data_keys

                    data_items.append(item_data)
            subsystem_data["data_transmission_storage"] = data_items

            # 保存不可否认性数据
            nonrepudiation_data = subsystem_data["nonrepudiation"]
            if subsystem_name in self.app_nonrepudiation_needed:
                nonrepudiation_data["needed"] = self.app_nonrepudiation_needed[subsystem_name].get()

            business_scenes = []
            if subsystem_name in self.app_business_scenes:
                for scene in self.app_business_scenes[subsystem_name]:
                    scene_data = {
                        "name": scene["name"].get(),
                        "implemented": scene["implemented"].get(),
                        "scope": scene["scope"].get(),
                        "anti_replay": scene["anti_replay"].get(),
                    }

                    if scene["implemented"].get():
                        impl = scene["implementation"]
                        scene_data["implementation"] = {
                            "mechanism": impl["mechanism"].get("1.0", END).strip(),
                            "compliant_tech": impl["compliant_tech"].get(),
                            "compliant_prod": impl["compliant_prod"].get(),
                            "algorithm": impl["algorithm"].get(),
                        }

                    if scene["anti_replay"].get() == "具备":
                        scene_data["anti_replay_mechanism"] = scene["anti_replay_text"].get("1.0", END).strip()

                    # 密码产品
                    key = (subsystem_name, scene["frame"])
                    scene_crypto_prods = []
                    if key in self.app_scene_crypto_products:
                        for prod in self.app_scene_crypto_products[key]:
                            scene_crypto_prods.append(
                                {
                                    "name": prod["name"].get(),
                                    "vendor": prod["vendor"].get(),
                                    "cert_no": prod["cert_no"].get(),
                                    "level": prod["level"].get(),
                                    "usage": prod["usage"].get(),
                                }
                            )
                    scene_data["crypto_products"] = scene_crypto_prods

                    # 密钥信息
                    scene_keys = []
                    if key in self.app_scene_keys:
                        for k in self.app_scene_keys[key]:
                            scene_keys.append(
                                {
                                    "name": k["name"].get(),
                                    "algorithm": k["algorithm"].get(),
                                    "length": k["length"].get(),
                                    "lifecycle": k["lifecycle"].get("1.0", END).strip(),
                                }
                            )
                    scene_data["keys"] = scene_keys

                    business_scenes.append(scene_data)
            nonrepudiation_data["business_scenes"] = business_scenes

            app_security_data[subsystem_name] = subsystem_data

        self.data["application_security"] = app_security_data
        messagebox.showinfo("成功", "应用和数据安全数据已保存！")

    def create_export_import_tab(self):
        tab = ttk.Frame(self.notebook)
        self.notebook.add(tab, text="📁 数据导入/导出")

        frame = ttk.Frame(tab, padding=20)
        frame.pack(fill=BOTH, expand=True)

        # 导出区域
        export_frame = ttk.LabelFrame(frame, text="数据导出", padding=15)
        export_frame.pack(fill=X, pady=10)
        export_frame.configure(style='Custom.TLabelframe')
        
        export_desc = ttk.Label(export_frame, text="将所有评估数据导出为 JSON 文件，便于备份和共享。", style='Normal.TLabel')
        export_desc.pack(anchor=W, pady=(0, 10))
        ttk.Button(export_frame, text="📤 导出全部数据 (JSON)", command=self.export_data, style='Header.TButton').pack(pady=5)

        # 导入区域
        import_frame = ttk.LabelFrame(frame, text="数据导入", padding=15)
        import_frame.pack(fill=X, pady=10)
        import_frame.configure(style='Custom.TLabelframe')
        
        import_desc = ttk.Label(import_frame, text="从 JSON 文件导入评估数据，覆盖当前所有数据。", style='Normal.TLabel')
        import_desc.pack(anchor=W, pady=(0, 10))
        ttk.Button(import_frame, text="📥 导入数据 (JSON)", command=self.import_data, style='Header.TButton').pack(pady=5)

        # 说明区域
        info_frame = ttk.LabelFrame(frame, text="使用说明", padding=15)
        info_frame.pack(fill=BOTH, expand=True, pady=10)
        info_frame.configure(style='Custom.TLabelframe')
        
        info = scrolledtext.ScrolledText(info_frame, height=8, font=('Arial', 10))
        info.pack(fill=BOTH, expand=True, pady=5)
        info.insert(END, "说明:\n\n")
        info.insert(END, "1. 导出功能将保存当前所有已填写的数据为 JSON 格式。\n")
        info.insert(END, "2. 导入功能将完全覆盖当前数据，请谨慎操作。\n")
        info.insert(END, "3. 建议定期导出数据进行备份。\n")
        info.insert(END, "4. 团队协作时，可通过共享 JSON 文件同步数据。\n")
        info.config(state='disabled')  # 只读

    def export_data(self):
        file_path = filedialog.asksaveasfilename(defaultextension=".json", filetypes=[("JSON", "*.json")])
        if file_path:
            with open(file_path, "w", encoding="utf-8") as f:
                json.dump(self.data, f, ensure_ascii=False, indent=2)
            messagebox.showinfo("成功", "数据导出成功！")

    def import_data(self):
        file_path = filedialog.askopenfilename(filetypes=[("JSON", "*.json")])
        if file_path:
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    self.data = json.load(f)
                messagebox.showinfo("成功", "数据导入成功！请刷新或重新加载界面查看。")
                # 实际应用中应在此处调用刷新界面的函数
            except (json.JSONDecodeError, FileNotFoundError, IOError) as e:
                messagebox.showerror("错误", f"导入失败：{str(e)}")


def main():
    root = tk.Tk()
    app = CryptoAssessmentTool(root)
    root.mainloop()


if __name__ == "__main__":
    main()
