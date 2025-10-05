// 家庭任务管理系统 - 带日历功能
class FamilyTaskSystem {
    constructor() {
        this.members = [];
        this.familyTasks = [];
        this.memoryCards = []; // 新增：背诵卡片数据
        this.houseworkReminders = []; // 新增：家务提醒数据
        this.completedHousework = []; // 新增：已完成的家务记录
        this.currentPage = 0;
        this.membersPerPage = 3;
        this.currentEditingMember = null;
        this.currentEditingTask = null;
        this.currentEditingMemory = null; // 新增：当前编辑的背诵内容
        this.selectedMemberId = null;
        this.selectedMemoryMemberId = null; // 新增：选中的背诵成员ID
        this.selectedHouseworkMemberId = null; // 新增：选中的家务成员ID
        this.currentMemoryHistoryDate = new Date(); // 新增：历史记录当前查看的月份
        this.currentEditingHousework = null; // 新增：当前编辑的家务提醒
        this.currentDelayingHousework = null; // 新增：当前推迟的家务
        this.currentReassigningHousework = null; // 新增：当前更换负责人的家务
        this.selectedReassignMemberId = null; // 新增：选中的新负责人
        this.currentCalendarDate = new Date();
        this.calendarView = 'week';
        this.selectedDate = null;
        // 统计功能相关属性
        this.selectedStatsMemberId = null;
        this.currentStatsDate = new Date();
        this.statsView = 'week';
        // 多设备同步相关属性
        this.useServerSync = this.detectServerMode();
        this.syncInterval = null;
        this.lastSyncTime = null;
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.updateDateTime();
        this.loadData();
        this.startSyncTimer();
        setInterval(() => this.updateDateTime(), 60000);
        
        // 页面关闭时清理资源
        window.addEventListener('beforeunload', () => {
            if (this.syncInterval) {
                clearInterval(this.syncInterval);
            }
        });
    }

    // 检测是否使用服务器模式
    detectServerMode() {
        return window.location.protocol === 'http:' && window.location.hostname !== 'file';
    }

    // 启动同步定时器
    startSyncTimer() {
        if (this.useServerSync) {
            // 使用稳定的轮询模式，避免SSE连接问题
            this.syncInterval = setInterval(() => this.syncDataFromServer(), 3000);
            this.showNotification('多设备同步已启用', 'success');
        } else {
            this.showNotification('本地模式，数据仅保存在当前设备', 'warning');
        }
    }

    // 设置Server-Sent Events连接
    setupEventSource() {
        if (this.eventSource) {
            this.eventSource.close();
        }
        
        try {
            this.eventSource = new EventSource('/api/events');
            
            this.eventSource.onopen = () => {
                console.log('SSE连接已建立');
                if (this.reconnectTimer) {
                    clearTimeout(this.reconnectTimer);
                    this.reconnectTimer = null;
                }
            };
            
            this.eventSource.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    
                    if (message.type === 'data_update') {
                        // 收到数据更新，立即更新本地数据
                        this.handleRemoteDataUpdate(message.data);
                    } else if (message.type === 'connected') {
                        console.log('服务器连接成功');
                    }
                } catch (e) {
                    console.warn('解析SSE消息失败:', e);
                }
            };
            
            this.eventSource.onerror = (event) => {
                console.warn('SSE连接错误:', event);
                this.eventSource.close();
                
                // 3秒后重连
                this.reconnectTimer = setTimeout(() => {
                    console.log('尝试重新连接SSE...');
                    this.setupEventSource();
                }, 3000);
            };
            
        } catch (error) {
            console.warn('无法建立SSE连接，使用轮询模式:', error);
            // 降级到轮询模式
            this.syncInterval = setInterval(() => this.syncDataFromServer(), 5000);
        }
    }

    // 处理远程数据更新
    handleRemoteDataUpdate(data) {
        if (data.lastUpdated && data.lastUpdated !== this.lastSyncTime) {
            this.members = data.familyMembers || [];
            this.familyTasks = data.familyTasks || [];
            this.memoryCards = data.memoryCards || [];
            this.lastSyncTime = data.lastUpdated;
            
            // 刷新界面
            this.loadFamilyData();
            this.updateCalendarMemberOptions();
            this.updateStatsMemberOptions();
            
            // 如果当前在日历页面，更新日历
            if (document.getElementById('calendar-page').classList.contains('active')) {
                this.renderCalendar();
            }
            
            // 如果当前在统计页面，更新统计
            if (document.getElementById('stats-page').classList.contains('active')) {
                this.renderStats();
            }
            
            // 如果当前在背诵页面，更新背诵
            if (document.getElementById('memory-page').classList.contains('active')) {
                this.updateMemoryMemberOptions();
                this.renderMemoryCards();
            }
            
            console.log('数据已实时同步');
        }
    }

    // 加载数据（兼容本地和服务器模式）
    async loadData() {
        if (this.useServerSync) {
            await this.loadDataFromServer();
        } else {
            this.loadDataFromLocal();
        }
        this.loadFamilyData();
    }

    // 从服务器加载数据
    async loadDataFromServer() {
        try {
            const response = await fetch('/api/data');
            if (response.ok) {
                const data = await response.json();
                this.members = data.familyMembers || [];
                this.familyTasks = data.familyTasks || [];
                this.memoryCards = data.memoryCards || [];
                this.houseworkReminders = data.houseworkReminders || [];
                this.completedHousework = data.completedHousework || [];
                this.lastSyncTime = data.lastUpdated;
                
                // 只有在服务器上确实没有任何数据时才初始化默认数据
                // 避免覆盖用户已有的数据
                if (this.members.length === 0 && this.familyTasks.length === 0 && this.memoryCards.length === 0 && this.houseworkReminders.length === 0 && !data.lastUpdated) {
                    console.log('服务器无数据，初始化默认数据');
                    this.initializeDefaultData();
                    await this.saveDataToServer();
                } else {
                    console.log('从服务器加载数据成功:', this.members.length, '个成员,', this.familyTasks.length, '个任务,', this.memoryCards.length, '个背诵卡片');
                }
            } else {
                console.warn('无法从服务器加载数据，使用本地数据');
                this.loadDataFromLocal();
            }
        } catch (error) {
            console.warn('服务器连接失败，使用本地数据:', error);
            this.loadDataFromLocal();
        }
    }

    // 从本地加载数据
    loadDataFromLocal() {
        this.members = JSON.parse(localStorage.getItem('familyMembers')) || [];
        this.familyTasks = JSON.parse(localStorage.getItem('familyTasks')) || [];
        this.memoryCards = JSON.parse(localStorage.getItem('memoryCards')) || [];
        this.houseworkReminders = JSON.parse(localStorage.getItem('houseworkReminders')) || [];
        this.completedHousework = JSON.parse(localStorage.getItem('completedHousework')) || [];
        
        // 只有在本地确实没有任何数据时才初始化默认数据
        if (this.members.length === 0 && this.familyTasks.length === 0 && this.memoryCards.length === 0 && this.houseworkReminders.length === 0) {
            console.log('本地无数据，初始化默认数据');
            this.initializeDefaultData();
            this.saveDataToLocal();
        } else {
            console.log('从本地加载数据成功:', this.members.length, '个成员,', this.familyTasks.length, '个任务,', this.memoryCards.length, '个背诵卡片');
        }
    }

    // 初始化默认数据
    initializeDefaultData() {
        this.members = [
            { id: 'mem001', name: '妈妈' },
            { id: 'mem002', name: '爸爸' },
            { id: 'mem003', name: '小明' },
            { id: 'mem004', name: '小红' }
        ];
        this.familyTasks = [
            { id: 'task001', title: '洗衣服', assignee: 'mem001', assigneeName: '妈妈', priority: 'medium', status: 'todo', createdAt: new Date().toISOString() },
            { id: 'task002', title: '完成数学作业', assignee: 'mem003', assigneeName: '小明', priority: 'high', status: 'todo', createdAt: new Date().toISOString() },
            { id: 'task003', title: '整理房间', assignee: 'mem004', assigneeName: '小红', priority: 'low', status: 'completed', createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), completedAt: new Date().toISOString() }
        ];
        this.memoryCards = [];
        this.houseworkReminders = [];
        this.completedHousework = [];
    }

    // 同步数据从服务器（定时检查更新）
    async syncDataFromServer() {
        if (!this.useServerSync) return;
        
        try {
            const response = await fetch('/api/data');
            if (response.ok) {
                const data = await response.json();
                
                // 检查数据是否有更新
                if (data.lastUpdated && data.lastUpdated !== this.lastSyncTime) {
                    // 只有在服务器有真实数据时才同步
                    if (data.familyMembers || data.familyTasks || data.memoryCards || data.houseworkReminders) {
                        this.members = data.familyMembers || [];
                        this.familyTasks = data.familyTasks || [];
                        this.memoryCards = data.memoryCards || [];
                        this.houseworkReminders = data.houseworkReminders || [];
                        this.lastSyncTime = data.lastUpdated;
                        
                        // 刷新界面
                        this.loadFamilyData();
                        this.updateCalendarMemberOptions();
                        this.updateStatsMemberOptions();
                        
                        // 如果当前在日历页面，更新日历
                        if (document.getElementById('calendar-page').classList.contains('active')) {
                            this.renderCalendar();
                        }
                        
                        // 如果当前在统计页面，更新统计
                        if (document.getElementById('stats-page').classList.contains('active')) {
                            this.renderStats();
                        }
                        
                        // 如果当前在背诵页面，更新背诵
                        if (document.getElementById('memory-page').classList.contains('active')) {
                            this.updateMemoryMemberOptions();
                            this.renderMemoryCards();
                        }
                        
                        console.log('数据已实时同步:', this.members.length, '个成员,', this.familyTasks.length, '个任务,', this.memoryCards.length, '个背诵卡片');
                    }
                }
            }
        } catch (error) {
            console.warn('同步数据失败:', error);
        }
    }

    async saveData() {
        if (this.useServerSync) {
            await this.saveDataToServer();
        } else {
            this.saveDataToLocal();
        }
    }

    // 保存数据到服务器
    async saveDataToServer() {
        try {
            const data = {
                familyMembers: this.members,
                familyTasks: this.familyTasks,
                memoryCards: this.memoryCards,
                houseworkReminders: this.houseworkReminders,
                completedHousework: this.completedHousework
            };
            
            const response = await fetch('/api/data', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data)
            });
            
            if (response.ok) {
                const result = await response.json();
                this.lastSyncTime = result.timestamp;
            } else {
                console.warn('保存到服务器失败，使用本地存储');
                this.saveDataToLocal();
            }
        } catch (error) {
            console.warn('服务器连接失败，使用本地存储:', error);
            this.saveDataToLocal();
        }
    }

    // 保存数据到本地
    saveDataToLocal() {
        localStorage.setItem('familyMembers', JSON.stringify(this.members));
        localStorage.setItem('familyTasks', JSON.stringify(this.familyTasks));
        localStorage.setItem('memoryCards', JSON.stringify(this.memoryCards));
        localStorage.setItem('houseworkReminders', JSON.stringify(this.houseworkReminders));
        localStorage.setItem('completedHousework', JSON.stringify(this.completedHousework));
    }

    setupEventListeners() {
        document.getElementById('add-member-btn').addEventListener('click', () => this.showMemberModal());
        document.getElementById('member-form').addEventListener('submit', async (e) => await this.handleMemberSubmit(e));
        document.getElementById('add-family-task-btn').addEventListener('click', () => this.showFamilyTaskModal());
        document.getElementById('family-task-form').addEventListener('submit', (e) => this.handleFamilyTaskSubmit(e));
        document.getElementById('calendar-btn').addEventListener('click', () => this.showCalendarPage());
        document.getElementById('memory-btn').addEventListener('click', () => this.showMemoryPage());
        document.getElementById('housework-btn').addEventListener('click', () => this.showHouseworkPage());
        document.getElementById('stats-btn').addEventListener('click', () => this.showStatsPage());
        document.getElementById('back-to-main').addEventListener('click', () => this.showMainPage());
        document.getElementById('back-to-main-from-stats').addEventListener('click', () => this.showMainPage());
        document.getElementById('back-to-main-from-memory').addEventListener('click', () => this.showMainPage());
        document.getElementById('back-to-main-from-housework').addEventListener('click', () => this.showMainPage());
        document.getElementById('calendar-member-select').addEventListener('change', (e) => this.onMemberChange(e));
        document.getElementById('stats-member-select').addEventListener('change', (e) => this.onStatsMemberChange(e));
        document.getElementById('add-memory-btn').addEventListener('click', () => this.showMemoryModal());
        document.getElementById('add-housework-btn').addEventListener('click', () => this.showHouseworkModal());
        document.getElementById('memory-history-btn').addEventListener('click', () => this.showMemoryHistoryModal());
        document.getElementById('memory-form').addEventListener('submit', (e) => this.handleMemorySubmit(e));
        document.getElementById('housework-form').addEventListener('submit', (e) => this.handleHouseworkSubmit(e));
        document.getElementById('toggle-completed').addEventListener('click', () => this.toggleCompletedMemories());
        document.getElementById('prev-memory-month').addEventListener('click', () => this.changeMemoryHistoryMonth(-1));
        document.getElementById('next-memory-month').addEventListener('click', () => this.changeMemoryHistoryMonth(1));
        document.getElementById('current-memory-month').addEventListener('click', () => this.backToCurrentMemoryMonth());
        document.getElementById('housework-frequency').addEventListener('change', (e) => this.onHouseworkFrequencyChange(e));
        document.getElementById('confirm-delay').addEventListener('click', () => this.confirmHouseworkDelay());
        document.getElementById('confirm-reassign').addEventListener('click', () => this.confirmHouseworkReassign());
        
        // 添加重复模式事件监听
        document.addEventListener('change', (e) => {
            if (e.target.name === 'repeatMode') {
                this.onRepeatModeChange(e.target.value);
            }
        });
        document.querySelectorAll('input[name="calendarView"]').forEach(radio => {
            radio.addEventListener('change', (e) => this.onViewChange(e));
        });
        document.querySelectorAll('input[name="statsView"]').forEach(radio => {
            radio.addEventListener('change', (e) => this.onStatsViewChange(e));
        });
        document.getElementById('prev-period').addEventListener('click', () => this.changePeriod(-1));
        document.getElementById('next-period').addEventListener('click', () => this.changePeriod(1));
        document.getElementById('back-to-current').addEventListener('click', () => this.backToCurrentPeriod());
        document.getElementById('prev-stats-period').addEventListener('click', () => this.changeStatsPeriod(-1));
        document.getElementById('next-stats-period').addEventListener('click', () => this.changeStatsPeriod(1));
        document.getElementById('back-to-current-stats').addEventListener('click', () => this.backToCurrentStatsPeriod());
        document.getElementById('date-task-form').addEventListener('submit', (e) => this.handleDateTaskSubmit(e));
        document.getElementById('enable-repeat').addEventListener('change', (e) => this.toggleRepeatOptions(e));
        document.getElementById('repeat-type').addEventListener('change', (e) => this.onRepeatTypeChange(e));
        document.getElementById('prev-page').addEventListener('click', () => this.changePage(-1));
        document.getElementById('next-page').addEventListener('click', () => this.changePage(1));
        document.querySelectorAll('[data-modal]').forEach(btn => {
            btn.addEventListener('click', (e) => this.closeModal(e.currentTarget.dataset.modal));
        });
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) this.closeModal(modal.id);
            });
        });
        
        // 添加推迟选项事件监听
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('delay-option')) {
                this.selectDelayOption(e.target.dataset.delay);
            }
        });
    }

    updateDateTime() {
        var now = new Date();
        document.getElementById('current-date').textContent = now.toLocaleDateString('zh-CN', {
            year: 'numeric', month: 'long', day: 'numeric'
        });
        document.getElementById('current-day').textContent = now.toLocaleDateString('zh-CN', {
            weekday: 'long'
        });
    }

    showCalendarPage() {
        document.getElementById('family-page').classList.remove('active');
        document.getElementById('calendar-page').classList.add('active');
        this.updateCalendarMemberOptions();
        this.selectedMemberId = null;
        document.getElementById('calendar-member-select').value = '';
        this.renderCalendar();
    }

    showMainPage() {
        document.getElementById('calendar-page').classList.remove('active');
        document.getElementById('stats-page').classList.remove('active');
        document.getElementById('memory-page').classList.remove('active');
        document.getElementById('housework-page').classList.remove('active');
        document.getElementById('family-page').classList.add('active');
        this.updateDateTime();
        this.loadFamilyData();
    }

    onMemberChange(e) {
        this.selectedMemberId = e.target.value;
        this.renderCalendar();
    }

    onViewChange(e) {
        this.calendarView = e.target.value;
        this.updatePeriodNavigation();
        this.renderCalendar();
    }

    changePeriod(direction) {
        if (this.calendarView === 'week') {
            this.currentCalendarDate.setDate(this.currentCalendarDate.getDate() + (direction * 7));
        } else {
            this.currentCalendarDate.setMonth(this.currentCalendarDate.getMonth() + direction);
        }
        this.updatePeriodNavigation();
        this.renderCalendar();
    }

    updatePeriodNavigation() {
        var display = document.getElementById('current-period-display');
        var prevBtn = document.getElementById('prev-period');
        var nextBtn = document.getElementById('next-period');
        
        if (this.calendarView === 'week') {
            var weekStart = this.getWeekStart(this.currentCalendarDate);
            var weekEnd = new Date(weekStart);
            weekEnd.setDate(weekEnd.getDate() + 6);
            display.textContent = weekStart.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' }) + ' - ' + weekEnd.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' });
            prevBtn.innerHTML = '<i class="fas fa-chevron-left"></i> 上一周';
            nextBtn.innerHTML = '下一周 <i class="fas fa-chevron-right"></i>';
        } else {
            display.textContent = this.currentCalendarDate.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long' });
            prevBtn.innerHTML = '<i class="fas fa-chevron-left"></i> 上个月';
            nextBtn.innerHTML = '下个月 <i class="fas fa-chevron-right"></i>';
        }
    }

    updateCalendarMemberOptions() {
        var select = document.getElementById('calendar-member-select');
        select.innerHTML = '<option value="">请选择成员</option>';
        this.members.forEach(member => {
            var option = document.createElement('option');
            option.value = member.id;
            option.textContent = member.name;
            select.appendChild(option);
        });
        this.updatePeriodNavigation();
    }

    renderCalendar() {
        var grid = document.getElementById('calendar-grid');
        if (!this.selectedMemberId) {
            grid.innerHTML = '<div class="no-member-selected"><i class="fas fa-user-clock"></i><p>请先选择家庭成员查看日历</p></div>';
            return;
        }
        grid.className = 'calendar-grid ' + this.calendarView + '-view';
        grid.innerHTML = '';
        
        if (this.calendarView === 'week') {
            this.renderWeekView(grid);
        } else {
            this.renderMonthView(grid);
        }
    }

    renderWeekView(grid) {
        var weekStart = this.getWeekStart(this.currentCalendarDate);
        for (var i = 0; i < 7; i++) {
            var date = new Date(weekStart);
            date.setDate(date.getDate() + i);
            grid.appendChild(this.createDayElement(date));
        }
    }

    renderMonthView(grid) {
        var firstDay = new Date(this.currentCalendarDate.getFullYear(), this.currentCalendarDate.getMonth(), 1);
        var startDate = this.getWeekStart(firstDay);
        for (var i = 0; i < 42; i++) {
            var date = new Date(startDate);
            date.setDate(date.getDate() + i);
            var dayElement = this.createDayElement(date);
            if (date.getMonth() !== this.currentCalendarDate.getMonth()) {
                dayElement.classList.add('other-month');
            }
            grid.appendChild(dayElement);
        }
    }

    createDayElement(date) {
        var dayElement = document.createElement('div');
        dayElement.className = 'calendar-day';
        if (this.isToday(date)) dayElement.classList.add('today');
        
        var dayNumber = document.createElement('div');
        dayNumber.className = 'day-number';
        dayNumber.textContent = date.getDate();
        dayElement.appendChild(dayNumber);
        
        var tasksContainer = document.createElement('div');
        tasksContainer.className = 'day-tasks';
        
        var dayTasks = this.getTasksForDate(date, this.selectedMemberId);
        dayTasks.forEach(task => {
            tasksContainer.appendChild(this.createDayTaskElement(task));
        });
        
        var addButton = document.createElement('button');
        addButton.className = 'add-task-btn';
        addButton.textContent = '+ 添加';
        addButton.onclick = () => this.showDateTaskModal(date);
        tasksContainer.appendChild(addButton);
        
        dayElement.appendChild(tasksContainer);
        return dayElement;
    }

    // 创建主页面任务元素
    createDayTaskElement(task) {
        var taskElement = document.createElement('div');
        taskElement.className = 'day-task-item priority-' + task.priority;
        
        var taskTitle = document.createElement('span');
        taskTitle.textContent = task.title;
        taskElement.appendChild(taskTitle);
        
        var deleteBtn = document.createElement('button');
        deleteBtn.className = 'task-delete-btn';
        deleteBtn.innerHTML = '×';
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            this.deleteTaskFromCalendar(task.id);
        };
        taskElement.appendChild(deleteBtn);
        
        return taskElement;
    }

    getTasksForDate(date, memberId) {
        var dateStr = date.toDateString();
        return this.familyTasks.filter(task => {
            if (task.assignee !== memberId) return false;
            var taskDate = new Date(task.scheduledDate || task.createdAt).toDateString();
            return taskDate === dateStr;
        }).sort(this.sortTasksByPriority);
    }

    showDateTaskModal(date) {
        this.selectedDate = date;
        var modal = document.getElementById('date-task-modal');
        var title = document.getElementById('date-task-modal-title');
        title.textContent = '为 ' + date.toLocaleDateString('zh-CN') + ' 添加任务';
        var form = document.getElementById('date-task-form');
        form.reset();
        // 重置重复选项
        document.getElementById('repeat-options').style.display = 'none';
        document.getElementById('daily-interval-group').style.display = 'none';
        modal.classList.add('active');
    }

    handleDateTaskSubmit(e) {
        e.preventDefault();
        if (!this.selectedDate || !this.selectedMemberId) {
            this.showNotification('请先选择日期和成员', 'warning');
            return;
        }
        
        var title = document.getElementById('date-task-title').value;
        var priority = document.getElementById('date-task-priority').value;
        var enableRepeat = document.getElementById('enable-repeat').checked;
        
        if (enableRepeat) {
            this.createRepeatingTasks();
        } else {
            this.createSingleTask(this.selectedDate, title, priority);
        }
        
        this.renderCalendar();
        this.closeModal('date-task-modal');
        this.showNotification('任务添加成功', 'success');
    }

    createSingleTask(date, title, priority) {
        var formData = {
            id: this.generateId(),
            title: title,
            assignee: this.selectedMemberId,
            assigneeName: this.getMemberName(this.selectedMemberId),
            priority: priority,
            status: 'todo',
            createdAt: new Date().toISOString(),
            scheduledDate: date.toISOString()
        };
        this.familyTasks.push(formData);
        this.saveData();
    }

    createRepeatingTasks() {
        var title = document.getElementById('date-task-title').value;
        var priority = document.getElementById('date-task-priority').value;
        var repeatType = document.getElementById('repeat-type').value;
        var repeatCount = parseInt(document.getElementById('repeat-count').value);
        var dailyInterval = parseInt(document.getElementById('daily-interval').value) || 1;
        
        var currentDate = new Date(this.selectedDate);
        
        for (var i = 0; i < repeatCount; i++) {
            this.createSingleTask(new Date(currentDate), title, priority);
            
            // 计算下一个日期
            switch (repeatType) {
                case 'daily':
                    currentDate.setDate(currentDate.getDate() + dailyInterval);
                    break;
                case 'weekly':
                    currentDate.setDate(currentDate.getDate() + 7);
                    break;
                case 'biweekly':
                    currentDate.setDate(currentDate.getDate() + 14);
                    break;
                case 'monthly':
                    currentDate.setMonth(currentDate.getMonth() + 1);
                    break;
            }
        }
    }

    isToday(date) {
        return date.toDateString() === new Date().toDateString();
    }

    deleteTaskFromCalendar(taskId) {
        if (confirm('确定要删除这个任务吗？')) {
            this.familyTasks = this.familyTasks.filter(t => t.id !== taskId);
            this.saveData();
            this.renderCalendar();
            this.showNotification('任务删除成功', 'success');
        }
    }

    getWeekStart(date) {
        var d = new Date(date);
        var day = d.getDay();
        var diff = d.getDate() - day + (day === 0 ? -6 : 1);
        return new Date(d.setDate(diff));
    }

    backToCurrentPeriod() {
        this.currentCalendarDate = new Date();
        this.updatePeriodNavigation();
        this.renderCalendar();
    }

    toggleRepeatOptions(e) {
        var repeatOptions = document.getElementById('repeat-options');
        if (e.target.checked) {
            repeatOptions.style.display = 'block';
        } else {
            repeatOptions.style.display = 'none';
        }
    }

    onRepeatTypeChange(e) {
        var dailyGroup = document.getElementById('daily-interval-group');
        if (e.target.value === 'daily') {
            dailyGroup.style.display = 'block';
        } else {
            dailyGroup.style.display = 'none';
        }
    }

    // 其余功能
    showMemberModal(member) {
        this.currentEditingMember = member || null;
        var modal = document.getElementById('member-modal');
        var title = document.getElementById('member-modal-title');
        if (member) {
            title.textContent = '编辑成员';
            document.getElementById('member-name').value = member.name;
        } else {
            title.textContent = '添加家庭成员';
            document.getElementById('member-form').reset();
        }
        modal.classList.add('active');
    }

    async handleMemberSubmit(e) {
        e.preventDefault();
        var formData = {
            id: this.currentEditingMember ? this.currentEditingMember.id : this.generateId(),
            name: document.getElementById('member-name').value
        };
        if (this.currentEditingMember) {
            var index = this.members.findIndex(m => m.id === this.currentEditingMember.id);
            if (index !== -1) this.members[index] = formData;
        } else {
            this.members.push(formData);
        }
        await this.saveData();
        this.loadFamilyData();
        this.closeModal('member-modal');
        this.showNotification(this.currentEditingMember ? '成员信息更新成功' : '成员添加成功', 'success');
    }

    async deleteMember(memberId) {
        if (confirm('确定要删除这个成员吗？相关任务也将被删除。')) {
            this.members = this.members.filter(m => m.id !== memberId);
            this.familyTasks = this.familyTasks.filter(t => t.assignee !== memberId);
            await this.saveData();
            this.loadFamilyData();
            this.showNotification('成员删除成功', 'success');
        }
    }

    showFamilyTaskModal(task) {
        this.currentEditingTask = task || null;
        var modal = document.getElementById('family-task-modal');
        var title = document.getElementById('family-task-modal-title');
        this.updateFamilyTaskAssigneeOptions();
        if (task) {
            title.textContent = '编辑任务';
            document.getElementById('family-task-title').value = task.title;
            document.getElementById('family-task-assignee').value = task.assignee;
            document.getElementById('family-task-priority').value = task.priority;
        } else {
            title.textContent = '添加任务';
            document.getElementById('family-task-form').reset();
        }
        modal.classList.add('active');
    }

    updateFamilyTaskAssigneeOptions() {
        var select = document.getElementById('family-task-assignee');
        select.innerHTML = '<option value="">请选择成员</option>';
        this.members.forEach(member => {
            var option = document.createElement('option');
            option.value = member.id;
            option.textContent = member.name;
            select.appendChild(option);
        });
    }

    handleFamilyTaskSubmit(e) {
        e.preventDefault();
        var formData = {
            id: this.currentEditingTask ? this.currentEditingTask.id : this.generateId(),
            title: document.getElementById('family-task-title').value,
            assignee: document.getElementById('family-task-assignee').value,
            assigneeName: this.getMemberName(document.getElementById('family-task-assignee').value),
            priority: document.getElementById('family-task-priority').value,
            status: this.currentEditingTask ? this.currentEditingTask.status : 'todo',
            createdAt: this.currentEditingTask ? this.currentEditingTask.createdAt : new Date().toISOString()
        };
        if (this.currentEditingTask) {
            var index = this.familyTasks.findIndex(t => t.id === this.currentEditingTask.id);
            if (index !== -1) this.familyTasks[index] = formData;
        } else {
            this.familyTasks.push(formData);
        }
        this.saveData();
        this.loadFamilyData();
        this.closeModal('family-task-modal');
        this.showNotification(this.currentEditingTask ? '任务更新成功' : '任务添加成功', 'success');
    }

    updateTaskStatus(taskId, newStatus) {
        var task = this.familyTasks.find(t => t.id === taskId);
        if (task) {
            task.status = newStatus;
            if (newStatus === 'completed') task.completedAt = new Date().toISOString();
            this.saveData();
            this.loadFamilyData();
            if (document.getElementById('calendar-page').classList.contains('active')) {
                this.renderCalendar();
            }
            var statusText = { 'todo': '待办', 'completed': '已完成', 'abandoned': '已放弃' };
            this.showNotification('任务状态更新为: ' + statusText[newStatus], 'success');
        }
    }

    deleteTask(taskId) {
        if (confirm('确定要删除这个任务吗？')) {
            this.familyTasks = this.familyTasks.filter(t => t.id !== taskId);
            this.saveData();
            this.loadFamilyData();
            this.showNotification('任务删除成功', 'success');
        }
    }

    loadFamilyData() {
        this.renderMembers();
        this.updatePagination();
        this.updateDateTime();
    }

    renderMembers() {
        var container = document.getElementById('family-members-container');
        container.innerHTML = '';
        if (this.members.length === 0) {
            container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 3rem; color: #0288d1;"><i class="fas fa-users" style="font-size: 3rem; margin-bottom: 1rem; display: block;"></i><h3>还没有家庭成员</h3><p>点击上方按钮添加第一个成员吧！</p></div>';
            return;
        }
        var startIndex = this.currentPage * this.membersPerPage;
        var endIndex = Math.min(startIndex + this.membersPerPage, this.members.length);
        var pageMembers = this.members.slice(startIndex, endIndex);
        var self = this;
        pageMembers.forEach(function(member) {
            container.appendChild(self.createMemberCard(member));
        });
    }

    createMemberCard(member) {
        // 获取今日日期
        var today = new Date();
        
        // 获取该成员的今日任务（使用与日历相同的日期筛选逻辑）
        var todayTasks = this.getTasksForDate(today, member.id);
        
        // 获取今日的家务提醒
        var todayHousework = this.getTodayHouseworkReminders(member.id);
        
        // 按状态分类今日任务
        var todoTasks = todayTasks.filter(task => task.status === 'todo').sort(this.sortTasksByPriority);
        var completedTasks = todayTasks.filter(task => task.status === 'completed');
        var abandonedTasks = todayTasks.filter(task => task.status === 'abandoned');
        
        // 获取今日完成的家务
        var todayCompletedHousework = this.getTodayCompletedHousework(member.id);
        
        // 获取今日已延期的家务（延期日期为今天的）
        var todayPostponedHousework = this.getTodayPostponedHousework(member.id);
        
        // 将今日的家务提醒添加到今日待办中（不包括延期的家务）
        var allTodoItems = [...todoTasks, ...todayHousework];
        
        var card = document.createElement('div');
        card.className = 'member-card';
        
        var cardHTML = 
            '<div class="member-header"><div class="member-name">' + member.name + '</div><div class="member-actions">' +
            '<button class="btn btn-cool btn-small" onclick="familyTaskSystem.showMemberModal(' + JSON.stringify(member).replace(/"/g, '&quot;') + ')"><i class="fas fa-edit"></i></button>' +
            '<button class="btn btn-danger btn-small" onclick="familyTaskSystem.deleteMember(\'' + member.id + '\')">' +
            '<i class="fas fa-trash"></i></button></div></div>' +
            '<div class="task-group"><div class="task-group-title todo">今日待办 (' + allTodoItems.length + ')</div>' +
            '<div class="task-list">' + this.renderTaskList(allTodoItems, 'todo') + '</div></div>';
        
        // 只有在有已完成任务或今日完成的家务时才显示已完成组
        if (completedTasks.length > 0 || todayCompletedHousework.length > 0) {
            var allCompletedItems = [...completedTasks, ...todayCompletedHousework];
            cardHTML += '<div class="task-group"><div class="task-group-title completed">今日已完成 (' + allCompletedItems.length + ')</div>' +
                '<div class="task-list">' + this.renderTaskList(allCompletedItems, 'completed') + '</div></div>';
        }
        
        // 只有在有已放弃任务时才显示已放弃组
        if (abandonedTasks.length > 0) {
            var allAbandonedItems = [...abandonedTasks];
            cardHTML += '<div class="task-group"><div class="task-group-title abandoned">今日已放弃 (' + allAbandonedItems.length + ')</div>' +
                '<div class="task-list">' + this.renderTaskList(allAbandonedItems, 'abandoned') + '</div></div>';
        }
        
        // 只有在有今日延期的家务时才显示家务延期组
        if (todayPostponedHousework.length > 0) {
            cardHTML += '<div class="task-group"><div class="task-group-title postponed">家务延期 (' + todayPostponedHousework.length + ')</div>' +
                '<div class="task-list">' + this.renderTaskList(todayPostponedHousework, 'postponed') + '</div></div>';
        }
        
        card.innerHTML = cardHTML;
        return card;
    }

    renderTaskList(items, status) {
        if (items.length === 0) {
            return '<div style="text-align: center; color: #999; padding: 1rem; font-size: 0.9rem;">暂无任务</div>';
        }
        return items.map(item => {
            // 判断是任务还是家务提醒
            var isHousework = item.frequency !== undefined;
            // 判断是否是完成的家务记录
            var isCompletedHousework = item.houseworkId !== undefined;
            // 判断是否是已延期的家务
            var isPostponedHousework = item.isPostponed !== undefined;
            // 判断是否为延期任务（在延期目标日期显示的）
            var isDelayedTask = item.isDelayedReminder || item.isDelayedTask;
            // 判断是否为前一天未完成的任务
            var isPreviousDayUnfinished = item.isPreviousDayUnfinished;
            
            var priorityEmoji = { 'high': '🔴', 'medium': '🟡', 'low': '🟢' };
            var actions = '';
            
            if (isPostponedHousework) {
                // 今日已延期的家务
                actions = '<div class="task-actions">' +
                    '<button class="btn-mini btn-cool" onclick="familyTaskSystem.cancelPostponedHousework(\'' + item.id + '\')" title="取消延期">↩️</button>' +
                    '<span class="postponed-badge">已延期</span>' +
                '</div>';
                return '<div class="task-item postponed-housework-item">' +
                    '<div class="task-content">' +
                        '<div class="task-title">' + item.title +
                            '<span class="task-priority-badge housework">🏠</span>' +
                            (isDelayedTask ? '<span class="delayed-badge">延期</span>' : '') +
                            (isPreviousDayUnfinished ? '<span class="previous-day-unfinished-badge">昨日未完成</span>' : '') +
                        '</div>' + actions +
                    '</div>' +
                '</div>';
            } else if (isCompletedHousework) {
                // 今日完成的家务记录
                actions = '<div class="task-actions">' +
                    '<button class="btn-mini btn-outline" onclick="familyTaskSystem.undoHousework(\'' + item.id + '\')" title="退回待办">↩️</button>' +
                    '<span class="completed-badge">已完成</span>' +
                '</div>';
                return '<div class="task-item completed-housework-item">' +
                    '<div class="task-content">' +
                        '<div class="task-title">' + item.title +
                            '<span class="task-priority-badge housework">🏠</span>' +
                        '</div>' + actions +
                    '</div>' +
                '</div>';
            } else if (isHousework) {
                // 家务提醒的操作按钮
                actions = '<div class="task-actions">' +
                    '<button class="btn-mini btn-cool" onclick="familyTaskSystem.completeHousework(\'' + item.id + '\')" title="完成">✓</button>' +
                    '<button class="btn-mini btn-secondary" onclick="familyTaskSystem.showHouseworkDelayModal(\'' + item.id + '\')" title="推迟">📅</button>' +
                    '<button class="btn-mini btn-outline" onclick="familyTaskSystem.showHouseworkReassignModal(\'' + item.id + '\')" title="更换负责人">🔄</button>' +
                '</div>';
                return '<div class="task-item housework-reminder">' +
                    '<div class="task-content">' +
                        '<div class="task-title">' + item.title +
                            '<span class="task-priority-badge housework">🏠</span>' +
                            (isDelayedTask ? '<span class="delayed-badge">延期</span>' : '') +
                            (isPreviousDayUnfinished ? '<span class="previous-day-unfinished-badge">昨日未完成</span>' : '') +
                        '</div>' + actions +
                    '</div>' +
                '</div>';
            } else {
                // 普通任务的操作按钮
                if (status === 'todo') {
                    actions = '<div class="task-actions">' +
                        '<button class="btn-mini btn-cool" onclick="familyTaskSystem.updateTaskStatus(\'' + item.id + '\', \'completed\')" title="完成">✓</button>' +
                        '<button class="btn-mini btn-danger" onclick="familyTaskSystem.updateTaskStatus(\'' + item.id + '\', \'abandoned\')" title="放弃">✕</button>' +
                        '<button class="btn-mini btn-secondary" onclick="familyTaskSystem.showFamilyTaskModal(' + JSON.stringify(item).replace(/"/g, '&quot;') + ')" title="编辑"><i class="fas fa-edit"></i></button>' +
                    '</div>';
                } else {
                    actions = '<div class="task-actions">' +
                        '<button class="btn-mini btn-cool" onclick="familyTaskSystem.updateTaskStatus(\'' + item.id + '\', \'todo\')" title="重新激活">↻</button>' +
                        '<button class="btn-mini btn-danger" onclick="familyTaskSystem.deleteTask(\'' + item.id + '\')" title="删除"><i class="fas fa-trash"></i></button>' +
                    '</div>';
                }
                return '<div class="task-item priority-' + item.priority + ' ' + status + '">' +
                    '<div class="task-content">' +
                        '<div class="task-title">' + item.title +
                            '<span class="task-priority-badge priority-' + item.priority + '">' + priorityEmoji[item.priority] + '</span>' +
                        '</div>' + actions +
                    '</div>' +
                '</div>';
            }
        }).join('');
    }

    sortTasksByPriority(a, b) {
        var priorityOrder = { 'high': 3, 'medium': 2, 'low': 1 };
        return priorityOrder[b.priority] - priorityOrder[a.priority];
    }

    changePage(direction) {
        var totalPages = Math.ceil(this.members.length / this.membersPerPage);
        var newPage = this.currentPage + direction;
        if (newPage >= 0 && newPage < totalPages) {
            this.currentPage = newPage;
            this.renderMembers();
            this.updatePagination();
        }
    }

    updatePagination() {
        var totalPages = Math.ceil(this.members.length / this.membersPerPage);
        document.getElementById('prev-page').disabled = this.currentPage === 0;
        document.getElementById('next-page').disabled = this.currentPage >= totalPages - 1 || totalPages === 0;
        document.getElementById('page-info').textContent = totalPages === 0 ? '0 / 0' : (this.currentPage + 1) + ' / ' + totalPages;
    }

    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    getMemberName(memberId) {
        var member = this.members.find(m => m.id === memberId);
        return member ? member.name : '未知成员';
    }

    closeModal(modalId) {
        document.getElementById(modalId).classList.remove('active');
        this.currentEditingMember = null;
        this.currentEditingTask = null;
        this.currentEditingMemory = null;
        this.currentDelayingHousework = null;
        this.currentReassigningHousework = null;
        this.selectedReassignMemberId = null;
    }

    showNotification(message, type) {
        var notification = document.createElement('div');
        notification.className = 'notification ' + (type || 'info');
        notification.textContent = message;
        document.body.appendChild(notification);
        
        // 实时同步状态的通知显示时间稍短
        var duration = (type === 'success' && message.includes('实时同步')) ? 2000 : 3000;
        setTimeout(() => notification.remove(), duration);
    }

    // 统计功能相关方法
    showStatsPage() {
        document.getElementById('family-page').classList.remove('active');
        document.getElementById('calendar-page').classList.remove('active');
        document.getElementById('stats-page').classList.add('active');
        this.updateStatsMemberOptions();
        this.selectedStatsMemberId = null;
        document.getElementById('stats-member-select').value = '';
        this.renderStats();
    }

    onStatsMemberChange(e) {
        this.selectedStatsMemberId = e.target.value;
        this.renderStats();
    }

    onStatsViewChange(e) {
        this.statsView = e.target.value;
        this.updateStatsPeriodNavigation();
        this.renderStats();
    }

    changeStatsPeriod(direction) {
        if (this.statsView === 'week') {
            this.currentStatsDate.setDate(this.currentStatsDate.getDate() + (direction * 7));
        } else {
            this.currentStatsDate.setMonth(this.currentStatsDate.getMonth() + direction);
        }
        this.updateStatsPeriodNavigation();
        this.renderStats();
    }

    backToCurrentStatsPeriod() {
        this.currentStatsDate = new Date();
        this.updateStatsPeriodNavigation();
        this.renderStats();
    }

    updateStatsPeriodNavigation() {
        var display = document.getElementById('current-stats-period-display');
        var prevBtn = document.getElementById('prev-stats-period');
        var nextBtn = document.getElementById('next-stats-period');
        
        if (this.statsView === 'week') {
            var weekStart = this.getWeekStart(this.currentStatsDate);
            var weekEnd = new Date(weekStart);
            weekEnd.setDate(weekEnd.getDate() + 6);
            display.textContent = weekStart.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' }) + ' - ' + weekEnd.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' });
            prevBtn.innerHTML = '<i class="fas fa-chevron-left"></i> 上一周';
            nextBtn.innerHTML = '下一周 <i class="fas fa-chevron-right"></i>';
        } else {
            display.textContent = this.currentStatsDate.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long' });
            prevBtn.innerHTML = '<i class="fas fa-chevron-left"></i> 上个月';
            nextBtn.innerHTML = '下个月 <i class="fas fa-chevron-right"></i>';
        }
    }

    updateStatsMemberOptions() {
        var select = document.getElementById('stats-member-select');
        select.innerHTML = '<option value="">请选择成员</option>';
        this.members.forEach(member => {
            var option = document.createElement('option');
            option.value = member.id;
            option.textContent = member.name;
            select.appendChild(option);
        });
        this.updateStatsPeriodNavigation();
    }

    renderStats() {
        var summary = document.getElementById('stats-summary');
        var taskList = document.getElementById('stats-task-list');
        
        if (!this.selectedStatsMemberId) {
            summary.innerHTML = '<div class="no-member-selected"><i class="fas fa-user-check"></i><p>请选择成员查看统计</p></div>';
            taskList.innerHTML = '';
            return;
        }
        
        var memberName = this.getMemberName(this.selectedStatsMemberId);
        var periodTasks = this.getTasksForStatsPeriod();
        var memberTasks = periodTasks.filter(task => task.assignee === this.selectedStatsMemberId && task.status === 'completed');
        
        // 获取该成员在统计期间完成的家务
        var periodHousework = this.getHouseworkForStatsPeriod();
        var memberHousework = periodHousework.filter(hw => hw.assignee === this.selectedStatsMemberId);
        
        // 统计任务完成次数
        var taskCounts = {};
        memberTasks.forEach(task => {
            if (taskCounts[task.title]) {
                taskCounts[task.title].count++;
            } else {
                taskCounts[task.title] = {
                    title: task.title,
                    count: 1,
                    priority: task.priority
                };
            }
        });
        
        // 统计家务完成次数
        var houseworkCounts = {};
        memberHousework.forEach(record => {
            if (houseworkCounts[record.title]) {
                houseworkCounts[record.title].count++;
            } else {
                houseworkCounts[record.title] = {
                    title: record.title,
                    count: 1
                };
            }
        });
        
        // 合并所有完成的项目
        var allCompletedItems = [...memberTasks, ...memberHousework];
        
        // 按完成次数从高到低排序
        var sortedTasks = Object.values(taskCounts).sort((a, b) => b.count - a.count);
        var sortedHousework = Object.values(houseworkCounts).sort((a, b) => b.count - a.count);
        
        // 更新统计概要
        var periodName = this.statsView === 'week' ? '本周' : '本月';
        var totalCompleted = allCompletedItems.length;
        var uniqueTasks = sortedTasks.length;
        var uniqueHousework = sortedHousework.length;
        
        summary.innerHTML = 
            '<h3>' + memberName + ' 的' + periodName + '任务统计</h3>' +
            '<div style="display: flex; gap: 2rem; justify-content: center; margin-top: 1rem;">' +
                '<div style="text-align: center;">' +
                    '<div style="font-size: 2rem; font-weight: bold; color: #4fc3f7;">' + totalCompleted + '</div>' +
                    '<div style="color: #666;">总完成次数</div>' +
                '</div>' +
                '<div style="text-align: center;">' +
                    '<div style="font-size: 2rem; font-weight: bold; color: #29b6f6;">' + uniqueTasks + '</div>' +
                    '<div style="color: #666;">不同任务</div>' +
                '</div>' +
                '<div style="text-align: center;">' +
                    '<div style="font-size: 2rem; font-weight: bold; color: #9c27b0;">' + uniqueHousework + '</div>' +
                    '<div style="color: #666;">不同家务</div>' +
                '</div>' +
            '</div>';
        
        // 更新任务列表
        if (sortedTasks.length === 0 && sortedHousework.length === 0) {
            taskList.innerHTML = '<div class="stats-empty"><i class="fas fa-clipboard-check"></i>' + periodName + '暂无已完成任务</div>';
        } else {
            var html = '<h4 style="margin-bottom: 1rem; color: #0277bd;">任务完成排行榜</h4>';
            
            // 显示普通任务统计
            if (sortedTasks.length > 0) {
                sortedTasks.forEach(task => {
                    html += 
                        '<div class="stats-task-item">' +
                            '<div class="stats-task-title">' + task.title + '</div>' +
                            '<div class="stats-task-count">' + task.count + '次</div>' +
                        '</div>';
                });
            }
            
            // 显示家务统计
            if (sortedHousework.length > 0) {
                html += '<h4 style="margin: 1rem 0; color: #673ab7;">家务完成排行榜</h4>';
                sortedHousework.forEach(hw => {
                    html += 
                        '<div class="stats-task-item housework-stats-item">' +
                            '<div class="stats-task-title">' + hw.title + '</div>' +
                            '<div class="stats-task-count">' + hw.count + '次</div>' +
                        '</div>';
                });
            }
            
            taskList.innerHTML = html;
        }
    }

    getTasksForStatsPeriod() {
        var periodStart, periodEnd;
        
        if (this.statsView === 'week') {
            periodStart = this.getWeekStart(this.currentStatsDate);
            periodEnd = new Date(periodStart);
            periodEnd.setDate(periodEnd.getDate() + 6);
            periodEnd.setHours(23, 59, 59, 999);
        } else {
            periodStart = new Date(this.currentStatsDate.getFullYear(), this.currentStatsDate.getMonth(), 1);
            periodEnd = new Date(this.currentStatsDate.getFullYear(), this.currentStatsDate.getMonth() + 1, 0);
            periodEnd.setHours(23, 59, 59, 999);
        }
        
        return this.familyTasks.filter(task => {
            if (!task.completedAt) return false;
            var completedDate = new Date(task.completedAt);
            return completedDate >= periodStart && completedDate <= periodEnd;
        });
    }
    
    // 获取统计期间的家务完成记录
    getHouseworkForStatsPeriod() {
        var periodStart, periodEnd;
        
        if (this.statsView === 'week') {
            periodStart = this.getWeekStart(this.currentStatsDate);
            periodEnd = new Date(periodStart);
            periodEnd.setDate(periodEnd.getDate() + 6);
            periodEnd.setHours(23, 59, 59, 999);
        } else {
            periodStart = new Date(this.currentStatsDate.getFullYear(), this.currentStatsDate.getMonth(), 1);
            periodEnd = new Date(this.currentStatsDate.getFullYear(), this.currentStatsDate.getMonth() + 1, 0);
            periodEnd.setHours(23, 59, 59, 999);
        }
        
        return this.completedHousework.filter(record => {
            var completedDate = new Date(record.completedDate);
            return completedDate >= periodStart && completedDate <= periodEnd;
        });
    }

    // ====== 背诵功能 ======
    
    // 显示背诵页面
    showMemoryPage() {
        document.getElementById('family-page').classList.remove('active');
        document.getElementById('calendar-page').classList.remove('active');
        document.getElementById('stats-page').classList.remove('active');
        document.getElementById('memory-page').classList.add('active');
        this.updateMemoryMemberOptions();
        this.selectedMemoryMemberId = null;
        document.getElementById('add-memory-btn').disabled = true;
        document.getElementById('memory-history-btn').disabled = true;
        this.renderMemoryCards();
    }
    
    // 更新背诵页面成员按钮
    updateMemoryMemberOptions() {
        var container = document.getElementById('memory-member-buttons');
        container.innerHTML = '';
        
        if (this.members.length === 0) {
            container.innerHTML = '<div class="no-members">暂无成员</div>';
            return;
        }
        
        this.members.forEach(member => {
            var button = document.createElement('button');
            button.className = 'btn btn-outline member-btn';
            button.textContent = member.name;
            button.onclick = () => this.selectMemoryMember(member.id);
            container.appendChild(button);
        });
    }
    
    // 选择背诵成员
    selectMemoryMember(memberId) {
        this.selectedMemoryMemberId = memberId;
        
        // 更新按钮状态
        document.querySelectorAll('.member-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        
        var selectedBtn = Array.from(document.querySelectorAll('.member-btn')).find(btn => {
            return btn.textContent === this.getMemberName(memberId);
        });
        if (selectedBtn) {
            selectedBtn.classList.add('active');
        }
        
        document.getElementById('add-memory-btn').disabled = false;
        document.getElementById('memory-history-btn').disabled = false;
        this.renderMemoryCards();
    }
    
    // 渲染背诵卡片
    renderMemoryCards() {
        var todayList = document.getElementById('memory-today-list');
        var completedList = document.getElementById('memory-completed-list');
        
        if (!this.selectedMemoryMemberId) {
            todayList.innerHTML = '<div class="no-member-selected"><i class="fas fa-user-graduate"></i><p>请选择成员查看背诵内容</p></div>';
            completedList.innerHTML = '';
            return;
        }
        
        var memberName = this.getMemberName(this.selectedMemoryMemberId);
        var today = new Date();
        
        // 获取今日需要背诵的卡片
        var todayCards = this.getTodayMemoryCards(this.selectedMemoryMemberId, today);
        var completedCards = this.getCompletedMemoryCards(this.selectedMemoryMemberId);
        
        // 渲染今日背诵
        if (todayCards.length === 0) {
            todayList.innerHTML = '<div class="memory-empty"><i class="fas fa-book-open"></i><p>' + memberName + ' 今日暂无背诵任务</p></div>';
        } else {
            todayList.innerHTML = todayCards.map(card => this.createMemoryCardElement(card, false)).join('');
        }
        
        // 渲染已背诵
        if (completedCards.length === 0) {
            completedList.innerHTML = '<div class="memory-empty"><i class="fas fa-check-circle"></i><p>暂无已背诵内容</p></div>';
        } else {
            completedList.innerHTML = completedCards.map(card => this.createMemoryCardElement(card, true)).join('');
        }
    }
    
    // 获取今日需要背诵的卡片
    getTodayMemoryCards(memberId, today) {
        var memoryIntervals = [1, 2, 3, 5, 8, 16, 31, 61, 91, 181]; // 艾宾浩斯遗忘曲线间隔天数
        
        return this.memoryCards.filter(card => {
            if (card.assignee !== memberId || card.isCompleted) return false;
            
            var baseDate;
            var todayDate = new Date(today);
            todayDate.setHours(0, 0, 0, 0);
            
            // 从开始日期开始计算
            baseDate = new Date(card.startDate);
            
            baseDate.setHours(0, 0, 0, 0);
            
            var daysDiff = Math.floor((todayDate - baseDate) / (1000 * 60 * 60 * 24)) + 1; // +1 让开始日期为第1天
            return memoryIntervals.includes(daysDiff);
        }).sort((a, b) => {
            var priorityOrder = { 'high': 3, 'medium': 2, 'low': 1 };
            return priorityOrder[b.priority] - priorityOrder[a.priority];
        });
    }
    

    
    // 获取已背诵的卡片
    getCompletedMemoryCards(memberId) {
        return this.memoryCards.filter(card => {
            return card.assignee === memberId && card.isCompleted;
        }).sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
    }
    
    // 创建背诵卡片元素
    createMemoryCardElement(card, isCompleted) {
        var priorityEmoji = { 'high': '🔴', 'medium': '🟡', 'low': '🟢' };
        var daysSinceStart = Math.floor((new Date() - new Date(card.startDate)) / (1000 * 60 * 60 * 24)) + 1; // +1 让开始日期为第1天
        
        var actionsHtml = '';
        if (!isCompleted) {
            actionsHtml = 
                '<div class="memory-card-actions">' +
                    '<button class="btn btn-small btn-cool" onclick="familyTaskSystem.markMemoryCompleted(\'' + card.id + '\')" title="已背诵">' +
                        '<i class="fas fa-check"></i> 已背诵' +
                    '</button>' +
                    '<button class="btn btn-small btn-danger" onclick="familyTaskSystem.deleteMemoryCard(\'' + card.id + '\')" title="删除">' +
                        '<i class="fas fa-trash"></i>' +
                    '</button>' +
                '</div>';
        } else {
            actionsHtml = 
                '<div class="memory-card-actions">' +
                    '<button class="btn btn-small btn-outline" onclick="familyTaskSystem.markMemoryUncompleted(\'' + card.id + '\')" title="重新激活">' +
                        '<i class="fas fa-redo"></i> 重新背诵' +
                    '</button>' +
                    '<button class="btn btn-small btn-danger" onclick="familyTaskSystem.deleteMemoryCard(\'' + card.id + '\')" title="删除">' +
                        '<i class="fas fa-trash"></i>' +
                    '</button>' +
                '</div>';
        }
        
        return '<div class="memory-card priority-' + card.priority + (isCompleted ? ' completed' : '') + '">' +
                '<div class="memory-card-header">' +
                    '<div class="memory-card-title">' + card.title + '</div>' +
                    '<div class="memory-card-meta">' +
                        '<span class="priority-badge priority-' + card.priority + '">' + priorityEmoji[card.priority] + '</span>' +
                        '<span class="days-badge">第' + daysSinceStart + '天</span>' +
                    '</div>' +
                '</div>' +
                '<div class="memory-card-content">' + card.content.substring(0, 100) + (card.content.length > 100 ? '...' : '') + '</div>' +
                '<div class="memory-card-footer">' +
                    '<div class="memory-card-date">开始：' + new Date(card.startDate).toLocaleDateString() + '</div>' +
                    actionsHtml +
                '</div>' +
            '</div>';
    }
    
    // 显示背诵模态框
    showMemoryModal(cardId = null) {
        this.currentEditingMemory = cardId ? this.memoryCards.find(c => c.id === cardId) : null;
        var modal = document.getElementById('memory-modal');
        var title = document.getElementById('memory-modal-title');
        var form = document.getElementById('memory-form');
        
        if (this.currentEditingMemory) {
            title.textContent = '编辑背诵内容';
            document.getElementById('memory-title').value = this.currentEditingMemory.title;
            document.getElementById('memory-content').value = this.currentEditingMemory.content;
            document.getElementById('memory-date').value = this.currentEditingMemory.startDate.split('T')[0];
            document.getElementById('memory-priority').value = this.currentEditingMemory.priority;
        } else {
            title.textContent = '添加背诵内容';
            form.reset();
            document.getElementById('memory-date').value = new Date().toISOString().split('T')[0];
        }
        
        modal.classList.add('active');
    }
    
    // 处理背诵表单提交
    handleMemorySubmit(e) {
        e.preventDefault();
        
        if (!this.selectedMemoryMemberId) {
            this.showNotification('请先选择成员', 'warning');
            return;
        }
        
        var formData = {
            id: this.currentEditingMemory ? this.currentEditingMemory.id : this.generateId(),
            title: document.getElementById('memory-title').value,
            content: document.getElementById('memory-content').value,
            startDate: document.getElementById('memory-date').value + 'T00:00:00.000Z',
            priority: document.getElementById('memory-priority').value,
            assignee: this.selectedMemoryMemberId,
            assigneeName: this.getMemberName(this.selectedMemoryMemberId),
            isCompleted: this.currentEditingMemory ? this.currentEditingMemory.isCompleted : false,
            createdAt: this.currentEditingMemory ? this.currentEditingMemory.createdAt : new Date().toISOString()
        };
        
        if (this.currentEditingMemory) {
            var index = this.memoryCards.findIndex(c => c.id === this.currentEditingMemory.id);
            if (index !== -1) this.memoryCards[index] = formData;
        } else {
            this.memoryCards.push(formData);
        }
        
        this.saveData();
        this.renderMemoryCards();
        this.closeModal('memory-modal');
        this.showNotification(this.currentEditingMemory ? '背诵内容更新成功' : '背诵内容添加成功', 'success');
    }
    
    // 标记为已背诵
    markMemoryCompleted(cardId) {
        var card = this.memoryCards.find(c => c.id === cardId);
        if (card) {
            card.isCompleted = true;
            card.completedAt = new Date().toISOString();
            this.saveData();
            this.renderMemoryCards();
            this.showNotification('已标记为背诵完成', 'success');
        }
    }
    
    // 标记为未背诵
    markMemoryUncompleted(cardId) {
        var card = this.memoryCards.find(c => c.id === cardId);
        if (card) {
            card.isCompleted = false;
            delete card.completedAt;
            this.saveData();
            this.renderMemoryCards();
            this.showNotification('已重新激活背诵任务', 'success');
        }
    }
    
    // 删除背诵卡片
    deleteMemoryCard(cardId) {
        if (confirm('确定要删除这个背诵内容吗？')) {
            this.memoryCards = this.memoryCards.filter(c => c.id !== cardId);
            this.saveData();
            this.renderMemoryCards();
            this.showNotification('背诵内容删除成功', 'success');
        }
    }
    
    // 测试背诵模块的艾宾浩斯遗忘曲线功能
    testMemorySchedule() {
        console.log("=== 背诵模块艾宾浩斯遗忘曲线测试 ===");
        
        // 创建测试卡片
        var testCard = {
            id: "test-card-001",
            title: "测试背诵内容",
            content: "这是用于测试艾宾浩斯遗忘曲线的背诵内容",
            startDate: new Date().toISOString(),
            priority: "medium",
            assignee: "test-member-001",
            assigneeName: "测试用户",
            isCompleted: false,
            createdAt: new Date().toISOString()
        };
        
        // 添加测试卡片到内存中
        this.memoryCards.push(testCard);
        
        console.log("1. 初始状态测试：");
        console.log("   卡片开始日期:", new Date(testCard.startDate).toDateString());
        console.log("   今天应该显示:", this.getTodayMemoryCards("test-member-001", new Date()).length > 0);
        
        // 模拟第一天完成背诵
        testCard.isCompleted = true;
        testCard.completedAt = new Date().toISOString();
        console.log("2. 第一天完成背诵后：");
        console.log("   完成时间:", new Date(testCard.completedAt).toDateString());
        
        // 测试第二天是否显示
        var tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        console.log("   第二天应该显示:", this.getTodayMemoryCards("test-member-001", tomorrow).length > 0);
        
        // 测试第三天是否显示
        var dayAfterTomorrow = new Date();
        dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);
        console.log("   第三天应该显示:", this.getTodayMemoryCards("test-member-001", dayAfterTomorrow).length > 0);
        
        // 从内存中移除测试卡片
        this.memoryCards = this.memoryCards.filter(card => card.id !== "test-card-001");
        
        console.log("=== 测试完成 ===");
    }
    
    // 切换已背诵列表显示
    toggleCompletedMemories() {
        var completedList = document.getElementById('memory-completed-list');
        var button = document.getElementById('toggle-completed');
        
        if (completedList.style.display === 'none') {
            completedList.style.display = 'block';
            button.textContent = '收起';
        } else {
            completedList.style.display = 'none';
            button.textContent = '展开';
        }
    }
    
    // 显示背诵历史记录模态框
    showMemoryHistoryModal() {
        if (!this.selectedMemoryMemberId) {
            this.showNotification('请先选择成员', 'warning');
            return;
        }
        
        var modal = document.getElementById('memory-history-modal');
        var title = document.getElementById('memory-history-modal-title');
        var memberName = this.getMemberName(this.selectedMemoryMemberId);
        
        title.textContent = memberName + ' 的背诵历史记录';
        this.currentMemoryHistoryDate = new Date();
        this.updateMemoryHistoryNavigation();
        this.renderMemoryHistoryCalendar();
        
        modal.classList.add('active');
    }
    
    // 更新历史记录导航
    updateMemoryHistoryNavigation() {
        var display = document.getElementById('current-memory-month-display');
        display.textContent = this.currentMemoryHistoryDate.toLocaleDateString('zh-CN', { 
            year: 'numeric', 
            month: 'long' 
        });
    }
    
    // 切换历史记录月份
    changeMemoryHistoryMonth(direction) {
        this.currentMemoryHistoryDate.setMonth(this.currentMemoryHistoryDate.getMonth() + direction);
        this.updateMemoryHistoryNavigation();
        this.renderMemoryHistoryCalendar();
    }
    
    // 返回当前月
    backToCurrentMemoryMonth() {
        this.currentMemoryHistoryDate = new Date();
        this.updateMemoryHistoryNavigation();
        this.renderMemoryHistoryCalendar();
    }
    
    // 渲染历史记录日历
    renderMemoryHistoryCalendar() {
        var calendar = document.getElementById('memory-history-calendar');
        var year = this.currentMemoryHistoryDate.getFullYear();
        var month = this.currentMemoryHistoryDate.getMonth();
        
        // 清空日历
        calendar.innerHTML = '';
        
        // 添加周几标题
        var weekdays = ['日', '一', '二', '三', '四', '五', '六'];
        weekdays.forEach(day => {
            var dayHeader = document.createElement('div');
            dayHeader.className = 'memory-calendar-weekday';
            dayHeader.textContent = day;
            calendar.appendChild(dayHeader);
        });
        
        // 获取月份的第一天和最后一天
        var firstDay = new Date(year, month, 1);
        var lastDay = new Date(year, month + 1, 0);
        
        // 获取第一周的开始日期（周日开始）
        var startDate = new Date(firstDay);
        startDate.setDate(firstDay.getDate() - firstDay.getDay());
        
        // 渲染42个日期格子（6周）
        for (var i = 0; i < 42; i++) {
            var date = new Date(startDate);
            date.setDate(startDate.getDate() + i);
            
            var dayElement = this.createMemoryHistoryDayElement(date, month);
            calendar.appendChild(dayElement);
        }
    }
    
    // 创建历史记录日期元素
    createMemoryHistoryDayElement(date, currentMonth) {
        var dayElement = document.createElement('div');
        dayElement.className = 'memory-calendar-day';
        
        // 判断是否为当前月
        if (date.getMonth() !== currentMonth) {
            dayElement.classList.add('other-month');
        }
        
        // 判断是否为今天
        if (this.isToday(date)) {
            dayElement.classList.add('today');
        }
        
        // 日期数字
        var dayNumber = document.createElement('div');
        dayNumber.className = 'day-number';
        dayNumber.textContent = date.getDate();
        dayElement.appendChild(dayNumber);
        
        // 查找该日期的背诵记录
        var memoryRecords = this.getMemoryRecordsForDate(date, this.selectedMemoryMemberId);
        
        if (memoryRecords.length > 0) {
            var recordsContainer = document.createElement('div');
            recordsContainer.className = 'memory-records';
            
            memoryRecords.forEach(record => {
                var recordElement = document.createElement('div');
                recordElement.className = 'memory-record priority-' + record.priority;
                
                var titleElement = document.createElement('span');
                titleElement.className = 'memory-record-title';
                titleElement.textContent = record.title;
                titleElement.title = record.content.substring(0, 50) + (record.content.length > 50 ? '...' : '');
                
                var deleteBtn = document.createElement('button');
                deleteBtn.className = 'memory-record-delete';
                deleteBtn.innerHTML = '<i class="fas fa-times"></i>';
                deleteBtn.title = '删除背诵内容';
                
                // 使用闭包保存record.id和this上下文
                var self = this;
                var recordId = record.id;
                deleteBtn.onclick = function(e) {
                    console.log('删除按钮被点击:', recordId);
                    e.stopPropagation();
                    self.deleteMemoryCardFromHistory(recordId);
                };
                
                recordElement.appendChild(titleElement);
                recordElement.appendChild(deleteBtn);
                recordsContainer.appendChild(recordElement);
            });
            
            dayElement.appendChild(recordsContainer);
        }
        
        return dayElement;
    }
    
    // 获取指定日期的背诵记录（用于历史记录）
    getMemoryRecordsForDate(date, memberId) {
        var dateStr = date.toDateString();
        return this.memoryCards.filter(card => {
            if (card.assignee !== memberId) return false;
            var startDate = new Date(card.startDate).toDateString();
            return startDate === dateStr;
        }).sort((a, b) => {
            var priorityOrder = { 'high': 3, 'medium': 2, 'low': 1 };
            return priorityOrder[b.priority] - priorityOrder[a.priority];
        });
    }
    
    // 从历史记录中删除背诵卡片
    deleteMemoryCardFromHistory(cardId) {
        console.log('尝试删除背诵卡片:', cardId);
        var card = this.memoryCards.find(c => c.id === cardId);
        if (!card) {
            console.error('未找到指定的背诵卡片:', cardId);
            return;
        }
        
        if (confirm('确定要删除背诵内容「' + card.title + '」吗？')) {
            console.log('用户确认删除，执行删除操作');
            this.memoryCards = this.memoryCards.filter(c => c.id !== cardId);
            this.saveData();
            this.renderMemoryHistoryCalendar();
            // 如果当前在背诵页面，也要更新显示
            if (document.getElementById('memory-page').classList.contains('active')) {
                this.renderMemoryCards();
            }
            this.showNotification('背诵内容删除成功', 'success');
        } else {
            console.log('用户取消删除操作');
        }
    }
    
    // ====== 家务功能 ======
    
    // 显示家务设置页面
    showHouseworkPage() {
        document.getElementById('family-page').classList.remove('active');
        document.getElementById('calendar-page').classList.remove('active');
        document.getElementById('stats-page').classList.remove('active');
        document.getElementById('memory-page').classList.remove('active');
        document.getElementById('housework-page').classList.add('active');
        this.updateHouseworkMemberOptions();
        this.selectedHouseworkMemberId = null;
        document.getElementById('add-housework-btn').disabled = true;
        this.renderHouseworkList();
    }
    
    // 更新家务页面成员按钮
    updateHouseworkMemberOptions() {
        var container = document.getElementById('housework-member-buttons');
        container.innerHTML = '';
        
        if (this.members.length === 0) {
            container.innerHTML = '<div class="no-members">暂无成员</div>';
            return;
        }
        
        this.members.forEach(member => {
            var button = document.createElement('button');
            button.className = 'btn btn-outline member-btn';
            button.textContent = member.name;
            button.onclick = () => this.selectHouseworkMember(member.id);
            container.appendChild(button);
        });
    }
    
    // 选择家务成员
    selectHouseworkMember(memberId) {
        this.selectedHouseworkMemberId = memberId;
        
        // 更新按钮状态
        document.querySelectorAll('#housework-member-buttons .member-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        
        var selectedBtn = Array.from(document.querySelectorAll('#housework-member-buttons .member-btn')).find(btn => {
            return btn.textContent === this.getMemberName(memberId);
        });
        if (selectedBtn) {
            selectedBtn.classList.add('active');
        }
        
        document.getElementById('add-housework-btn').disabled = false;
        this.renderHouseworkList();
    }
    
    // 渲染家务列表
    renderHouseworkList() {
        var houseworkList = document.getElementById('housework-list');
        
        if (!this.selectedHouseworkMemberId) {
            houseworkList.innerHTML = '<div class="no-member-selected"><i class="fas fa-broom"></i><p>请选择成员查看家务提醒</p></div>';
            return;
        }
        
        var memberName = this.getMemberName(this.selectedHouseworkMemberId);
        var memberHousework = this.houseworkReminders.filter(hw => hw.assignee === this.selectedHouseworkMemberId);
        
        if (memberHousework.length === 0) {
            houseworkList.innerHTML = '<div class="housework-empty"><i class="fas fa-broom"></i><p>' + memberName + ' 暂无家务提醒</p></div>';
        } else {
            houseworkList.innerHTML = memberHousework.map(hw => this.createHouseworkElement(hw)).join('');
        }
    }
    
    // 创建家务元素
    createHouseworkElement(housework) {
        var frequencyText = this.getFrequencyText(housework.frequency, housework.customDays);
        var nextReminderDate = this.getNextHouseworkDate(housework);
        var isToday = nextReminderDate && this.isToday(new Date(nextReminderDate));
        
        // 如果家务已延期，显示延期信息
        var nextReminderText = '';
        if (housework.isPostponed && housework.postponedDate) {
            var postponedDate = new Date(housework.postponedDate);
            nextReminderText = '已延期至：' + postponedDate.toLocaleDateString();
        } else {
            nextReminderText = '下次提醒：' + (nextReminderDate ? new Date(nextReminderDate).toLocaleDateString() : '无');
        }
        
        // 检查是否为延期任务（在延期目标日期显示的）
        var isDelayedTask = housework.isDelayedReminder || housework.isDelayedTask;
        var delayedBadge = isDelayedTask ? '<span class="delayed-badge">延期</span>' : '';
        
        // 检查是否为前一天未完成的任务
        var previousDayUnfinishedBadge = housework.isPreviousDayUnfinished ? '<span class="previous-day-unfinished-badge">昨日未完成</span>' : '';
        
        return '<div class="housework-card' + (isToday ? ' today-reminder' : '') + '">' +
                '<div class="housework-header">' +
                    '<div class="housework-title">' + housework.title + delayedBadge + previousDayUnfinishedBadge + '</div>' +
                    '<div class="housework-actions">' +
                        '<button class="btn btn-small btn-cool" onclick="familyTaskSystem.showHouseworkModal(\'' + housework.id + '\')" title="修改">' +
                            '<i class="fas fa-edit"></i>' +
                        '</button>' +
                        '<button class="btn btn-small btn-danger" onclick="familyTaskSystem.deleteHousework(\'' + housework.id + '\')" title="删除">' +
                            '<i class="fas fa-trash"></i>' +
                        '</button>' +
                    '</div>' +
                '</div>' +
                (housework.description ? '<div class="housework-description">' + housework.description + '</div>' : '') +
                '<div class="housework-footer">' +
                    '<div class="housework-frequency">频率：' + frequencyText + '</div>' +
                    '<div class="housework-next-date">' + nextReminderText + '</div>' +
                '</div>' +
            '</div>';
    }
    
    // 获取频率文本
    getFrequencyText(frequency, customDays) {
        switch(frequency) {
            case 'daily': return '每天';
            case 'weekly': return '每周';
            case 'monthly': return '每月';
            case 'custom': return '每' + customDays + '天';
            default: return '未知';
        }
    }
    
    // 获取下次家务提醒日期
    getNextHouseworkDate(housework) {
        var today = new Date();
        today.setHours(0, 0, 0, 0);
        
        // 如果家务已延期，则优先使用延期日期
        if (housework.isPostponed && housework.postponedDate) {
            var postponedDate = new Date(housework.postponedDate);
            postponedDate.setHours(0, 0, 0, 0);
            // 如果延期日期在今天或之后，则返回延期日期
            if (postponedDate >= today) {
                return postponedDate.toISOString();
            }
            // 如果延期日期在今天之前，说明已经过了延期日期，应该按照正常规则计算
        }
        
        // 根据重复模式选择计算基准日期
        var baseDate;
        if (housework.repeatMode === 'flexible' && housework.lastCompletedDate) {
            // 非固定日期：从最后完成日期开始计算
            baseDate = new Date(housework.lastCompletedDate);
        } else {
            // 固定日期：从开始日期开始计算
            baseDate = new Date(housework.startDate);
        }
        
        baseDate.setHours(0, 0, 0, 0);
        
        var interval;
        switch(housework.frequency) {
            case 'daily': interval = 1; break;
            case 'weekly': interval = 7; break;
            case 'monthly': interval = 30; break;
            case 'custom': interval = housework.customDays || 7; break;
            default: return null;
        }
        
        // 计算从基准日期开始的下一个提醒日期
        var daysDiff = Math.floor((today - baseDate) / (1000 * 60 * 60 * 24));
        var cycles = Math.max(0, Math.floor(daysDiff / interval));
        
        // 计算下一个提醒日期
        var nextDate = new Date(baseDate);
        nextDate.setDate(baseDate.getDate() + (cycles + 1) * interval);
        
        // 如果计算出的日期是今天，计算下一个周期的日期
        if (nextDate.toDateString() === today.toDateString()) {
            nextDate.setDate(nextDate.getDate() + interval);
        }
        
        return nextDate.toISOString();
    }
    
    // 显示家务模态框
    showHouseworkModal(houseworkId = null) {
        this.currentEditingHousework = houseworkId ? this.houseworkReminders.find(hw => hw.id === houseworkId) : null;
        var modal = document.getElementById('housework-modal');
        var title = document.getElementById('housework-modal-title');
        var form = document.getElementById('housework-form');
        
        if (this.currentEditingHousework) {
            title.textContent = '编辑家务提醒';
            document.getElementById('housework-title').value = this.currentEditingHousework.title;
            document.getElementById('housework-description').value = this.currentEditingHousework.description || '';
            document.getElementById('housework-frequency').value = this.currentEditingHousework.frequency;
            document.getElementById('housework-start-date').value = this.currentEditingHousework.startDate.split('T')[0];
            
            // 设置重复模式
            var repeatMode = this.currentEditingHousework.repeatMode || 'fixed';
            document.querySelector('input[name="repeatMode"][value="' + repeatMode + '"]').checked = true;
            this.onRepeatModeChange(repeatMode);
            
            if (this.currentEditingHousework.frequency === 'custom') {
                document.getElementById('custom-frequency-group').style.display = 'block';
                document.getElementById('custom-days').value = this.currentEditingHousework.customDays;
            }
        } else {
            title.textContent = '添加家务提醒';
            form.reset();
            document.getElementById('housework-start-date').value = new Date().toISOString().split('T')[0];
            document.getElementById('custom-frequency-group').style.display = 'none';
            
            // 默认选中固定日期模式
            document.querySelector('input[name="repeatMode"][value="fixed"]').checked = true;
            this.onRepeatModeChange('fixed');
        }
        
        modal.classList.add('active');
    }
    
    // 处理家务表单提交
    handleHouseworkSubmit(e) {
        e.preventDefault();
        
        if (!this.selectedHouseworkMemberId) {
            this.showNotification('请先选择成员', 'warning');
            return;
        }
        
        var frequency = document.getElementById('housework-frequency').value;
        var customDays = frequency === 'custom' ? parseInt(document.getElementById('custom-days').value) : null;
        var repeatMode = document.querySelector('input[name="repeatMode"]:checked').value;
        
        var formData = {
            id: this.currentEditingHousework ? this.currentEditingHousework.id : this.generateId(),
            title: document.getElementById('housework-title').value,
            description: document.getElementById('housework-description').value,
            frequency: frequency,
            customDays: customDays,
            repeatMode: repeatMode, // 新增：重复模式
            startDate: document.getElementById('housework-start-date').value + 'T00:00:00.000Z',
            assignee: this.selectedHouseworkMemberId,
            assigneeName: this.getMemberName(this.selectedHouseworkMemberId),
            createdAt: this.currentEditingHousework ? this.currentEditingHousework.createdAt : new Date().toISOString(),
            lastCompletedDate: this.currentEditingHousework ? this.currentEditingHousework.lastCompletedDate : null // 新增：最后完成日期
        };
        
        if (this.currentEditingHousework) {
            var index = this.houseworkReminders.findIndex(hw => hw.id === this.currentEditingHousework.id);
            if (index !== -1) this.houseworkReminders[index] = formData;
        } else {
            this.houseworkReminders.push(formData);
        }
        
        this.saveData();
        this.renderHouseworkList();
        this.loadFamilyData(); // 更新主页面显示
        this.closeModal('housework-modal');
        this.showNotification(this.currentEditingHousework ? '家务提醒更新成功' : '家务提醒添加成功', 'success');
    }
    
    // 删除家务提醒
    deleteHousework(houseworkId) {
        var housework = this.houseworkReminders.find(hw => hw.id === houseworkId);
        if (!housework) return;
        
        if (confirm('确定要删除家务提醒「' + housework.title + '」吗？')) {
            this.houseworkReminders = this.houseworkReminders.filter(hw => hw.id !== houseworkId);
            this.saveData();
            this.renderHouseworkList();
            this.loadFamilyData(); // 更新主页面显示
            this.showNotification('家务提醒删除成功', 'success');
        }
    }
    
    // 家务频率变化事件
    onHouseworkFrequencyChange(e) {
        var customGroup = document.getElementById('custom-frequency-group');
        if (e.target.value === 'custom') {
            customGroup.style.display = 'block';
        } else {
            customGroup.style.display = 'none';
        }
    }
    
    // 重复模式变化事件
    onRepeatModeChange(mode) {
        var fixedDesc = document.querySelector('.fixed-desc');
        var flexibleDesc = document.querySelector('.flexible-desc');
        
        if (mode === 'flexible') {
            fixedDesc.style.display = 'none';
            flexibleDesc.style.display = 'block';
        } else {
            fixedDesc.style.display = 'block';
            flexibleDesc.style.display = 'none';
        }
    }
    
    // 获取今日的家务提醒
    getTodayHouseworkReminders(memberId) {
        var today = new Date();
        today.setHours(0, 0, 0, 0);
        
        // 计算昨天的日期
        var yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        
        return this.houseworkReminders.filter(hw => {
            if (hw.assignee !== memberId) return false;
            
            // 检查是否已经完成（今天已完成的家务不应再显示在待办中）
            var isCompletedToday = this.completedHousework.some(record => {
                return record.houseworkId === hw.id && 
                       new Date(record.completedDate).toDateString() === today.toDateString();
            });
            
            if (isCompletedToday) return false;
            
            // 检查是否已延期
            if (hw.isPostponed && hw.postponedDate) {
                var postponedDate = new Date(hw.postponedDate);
                postponedDate.setHours(0, 0, 0, 0);
                // 如果延期日期是今天，则显示在今日待办中，并标记为延期任务
                if (postponedDate.toDateString() === today.toDateString()) {
                    // 标记为延期任务，以便在界面中显示延期标识
                    hw.isDelayedReminder = true;
                    return true;
                }
                // 如果延期日期不是今天，则不显示在今日待办中
                return false;
            }
            
            // 新增：检查前一天未完成的家务（每天家务除外）
            if (hw.frequency !== 'daily') {
                // 检查该家务是否应该在昨天提醒
                if (this.isHouseworkDueOnDate(hw, yesterday)) {
                    // 检查昨天是否已完成该家务
                    var isCompletedYesterday = this.completedHousework.some(record => {
                        return record.houseworkId === hw.id && 
                               new Date(record.completedDate).toDateString() === yesterday.toDateString();
                    });
                    
                    // 如果昨天应该提醒但未完成，则今天显示该家务
                    if (!isCompletedYesterday) {
                        // 标记为前一天未完成的任务
                        hw.isPreviousDayUnfinished = true;
                        return true;
                    }
                }
            }
            
            // 根据重复模式选择计算基准日期
            var baseDate;
            if (hw.repeatMode === 'flexible' && hw.lastCompletedDate) {
                // 非固定日期：从最后完成日期开始计算
                baseDate = new Date(hw.lastCompletedDate);
            } else {
                // 固定日期：从开始日期开始计算
                baseDate = new Date(hw.startDate);
            }
            
            baseDate.setHours(0, 0, 0, 0);
            
            var daysDiff = Math.floor((today - baseDate) / (1000 * 60 * 60 * 24));
            
            // 如果还没到开始日期，不显示
            if (daysDiff < 0) return false;
            
            var interval;
            switch(hw.frequency) {
                case 'daily': interval = 1; break;
                case 'weekly': interval = 7; break;
                case 'monthly': interval = 30; break;
                case 'custom': interval = hw.customDays || 7; break;
                default: return false;
            }
            
            // 检查今天是否应该提醒（从基准日期计算）
            return (daysDiff % interval) === 0;
        });
    }
    
    // 检查家务是否应在指定日期提醒
    isHouseworkDueOnDate(housework, targetDate) {
        // 根据重复模式选择计算基准日期
        var baseDate;
        if (housework.repeatMode === 'flexible' && housework.lastCompletedDate) {
            // 非固定日期：从最后完成日期开始计算
            baseDate = new Date(housework.lastCompletedDate);
        } else {
            // 固定日期：从开始日期开始计算
            baseDate = new Date(housework.startDate);
        }
        
        baseDate.setHours(0, 0, 0, 0);
        targetDate.setHours(0, 0, 0, 0);
        
        var daysDiff = Math.floor((targetDate - baseDate) / (1000 * 60 * 60 * 24));
        
        // 如果还没到开始日期，不提醒
        if (daysDiff < 0) return false;
        
        var interval;
        switch(housework.frequency) {
            case 'daily': interval = 1; break;
            case 'weekly': interval = 7; break;
            case 'monthly': interval = 30; break;
            case 'custom': interval = housework.customDays || 7; break;
            default: return false;
        }
        
        // 检查目标日期是否应该提醒（从基准日期计算）
        return (daysDiff % interval) === 0;
    }
    
    // 完成家务
    completeHousework(houseworkId) {
        var housework = this.houseworkReminders.find(hw => hw.id === houseworkId);
        if (!housework) return;
        
        var completedDate = new Date().toISOString();
        
        // 更新家务的最后完成日期
        housework.lastCompletedDate = completedDate;
        
        // 创建完成记录
        var completedRecord = {
            id: this.generateId(),
            houseworkId: housework.id,
            title: housework.title,
            description: housework.description,
            assignee: housework.assignee,
            assigneeName: housework.assigneeName,
            completedDate: completedDate,
            originalDueDate: new Date().toISOString()
        };
        
        this.completedHousework.push(completedRecord);
        this.saveData();
        this.loadFamilyData();
        this.showNotification('家务「' + housework.title + '」已完成', 'success');
    }
    
    // 显示家务推迟模态框
    showHouseworkDelayModal(houseworkId) {
        var housework = this.houseworkReminders.find(hw => hw.id === houseworkId);
        if (!housework) return;
        
        this.currentDelayingHousework = housework;
        var modal = document.getElementById('housework-delay-modal');
        var info = document.getElementById('housework-delay-info');
        
        info.textContent = '请选择对「' + housework.title + '」的推迟时间：';
        
        // 重置选项
        document.querySelectorAll('.delay-option').forEach(btn => btn.classList.remove('active'));
        document.getElementById('custom-delay-group').style.display = 'none';
        
        modal.classList.add('active');
    }
    
    // 选择推迟选项
    selectDelayOption(delayType) {
        document.querySelectorAll('.delay-option').forEach(btn => btn.classList.remove('active'));
        document.querySelector('[data-delay="' + delayType + '"]').classList.add('active');
        
        var customGroup = document.getElementById('custom-delay-group');
        if (delayType === 'custom') {
            customGroup.style.display = 'block';
        } else {
            customGroup.style.display = 'none';
        }
    }
    
    // 确认推迟家务
    confirmHouseworkDelay() {
        if (!this.currentDelayingHousework) return;
        
        var activeOption = document.querySelector('.delay-option.active');
        if (!activeOption) {
            this.showNotification('请选择推迟选项', 'warning');
            return;
        }
        
        var delayType = activeOption.dataset.delay;
        var delayDays = 0;
        var today = new Date();
        
        switch(delayType) {
            case 'weekend':
                // 推迟到本周末（周六）
                delayDays = 6 - today.getDay();
                if (delayDays <= 0) delayDays = 6; // 如果今天是周末，推迟到下周六
                break;
            case 'next-weekend':
                // 推迟到下个周末
                delayDays = 6 - today.getDay() + 7;
                break;
            case 'custom':
                delayDays = parseInt(document.getElementById('custom-delay-days').value) || 3;
                break;
        }
        
        // 计算延期日期
        var postponedDate = new Date(today);
        postponedDate.setDate(today.getDate() + delayDays);
        
        // 不再创建一次性推迟记录，而是直接标记原家务为已延期状态
        // 标记原家务为已延期状态，并设置正确的延期日期
        this.currentDelayingHousework.isPostponed = true;
        this.currentDelayingHousework.postponedDate = postponedDate.toISOString();
        // 添加延期标识
        this.currentDelayingHousework.isDelayedTask = true;
        
        this.saveData();
        this.loadFamilyData();
        this.closeModal('housework-delay-modal');
        
        var delayText = delayType === 'weekend' ? '本周末' : 
                       delayType === 'next-weekend' ? '下个周末' : 
                       delayDays + '天后';
        this.showNotification('家务「' + this.currentDelayingHousework.title + '」已推迟至' + delayText, 'success');
    }
    
    // 显示家务更换负责人模态框
    showHouseworkReassignModal(houseworkId) {
        var housework = this.houseworkReminders.find(hw => hw.id === houseworkId);
        if (!housework) return;
        
        this.currentReassigningHousework = housework;
        this.selectedReassignMemberId = null;
        
        var modal = document.getElementById('housework-reassign-modal');
        var info = document.getElementById('housework-reassign-info');
        
        info.textContent = '请为「' + housework.title + '」选择新的负责人：';
        
        this.updateReassignMemberButtons();
        modal.classList.add('active');
    }
    
    // 更新更换负责人按钮
    updateReassignMemberButtons() {
        var container = document.getElementById('reassign-member-buttons');
        container.innerHTML = '';
        
        this.members.forEach(member => {
            // 跳过当前负责人
            if (member.id === this.currentReassigningHousework.assignee) return;
            
            var button = document.createElement('button');
            button.className = 'btn btn-outline member-btn';
            button.textContent = member.name;
            button.onclick = () => this.selectReassignMember(member.id);
            container.appendChild(button);
        });
    }
    
    // 选择新负责人
    selectReassignMember(memberId) {
        this.selectedReassignMemberId = memberId;
        
        document.querySelectorAll('#reassign-member-buttons .member-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        
        var selectedBtn = Array.from(document.querySelectorAll('#reassign-member-buttons .member-btn')).find(btn => {
            return btn.textContent === this.getMemberName(memberId);
        });
        if (selectedBtn) {
            selectedBtn.classList.add('active');
        }
    }
    
    // 确认更换负责人
    confirmHouseworkReassign() {
        if (!this.currentReassigningHousework || !this.selectedReassignMemberId) {
            this.showNotification('请选择新的负责人', 'warning');
            return;
        }
        
        var reassignType = document.querySelector('input[name="reassignType"]:checked').value;
        var newMemberName = this.getMemberName(this.selectedReassignMemberId);
        
        if (reassignType === 'permanent') {
            // 永久更换：直接修改原家务提醒
            this.currentReassigningHousework.assignee = this.selectedReassignMemberId;
            this.currentReassigningHousework.assigneeName = newMemberName;
            this.showNotification('家务「' + this.currentReassigningHousework.title + '」已永久更换给' + newMemberName, 'success');
        } else {
            // 临时更换：创建一次性任务
            var reassignedTask = {
                id: this.generateId(),
                title: this.currentReassigningHousework.title,
                description: this.currentReassigningHousework.description,
                assignee: this.selectedReassignMemberId,
                assigneeName: newMemberName,
                priority: 'medium',
                status: 'todo',
                createdAt: new Date().toISOString(),
                isReassigned: true,
                originalHouseworkId: this.currentReassigningHousework.id
            };
            
            this.familyTasks.push(reassignedTask);
            this.showNotification('家务「' + this.currentReassigningHousework.title + '」已临时更换给' + newMemberName, 'success');
        }
        
        this.saveData();
        this.loadFamilyData();
        this.closeModal('housework-reassign-modal');
    }
    
    // 获取今日完成的家务
    getTodayCompletedHousework(memberId) {
        var today = new Date();
        today.setHours(0, 0, 0, 0);
        
        return this.completedHousework.filter(record => {
            if (record.assignee !== memberId) return false;
            
            var completedDate = new Date(record.completedDate);
            completedDate.setHours(0, 0, 0, 0);
            
            return completedDate.toDateString() === today.toDateString();
        });
    }
    
    // 获取今日已延期的家务
    getTodayPostponedHousework(memberId) {
        var today = new Date();
        today.setHours(0, 0, 0, 0);
        
        return this.houseworkReminders.filter(hw => {
            if (hw.assignee !== memberId) return false;
            
            // 检查是否已延期
            if (!hw.isPostponed) return false;
            
            // 检查延期日期是否存在
            if (!hw.postponedDate) return false;
            
            var postponedDate = new Date(hw.postponedDate);
            postponedDate.setHours(0, 0, 0, 0);
            
            return postponedDate.toDateString() === today.toDateString();
        });
    }
    
    // 退回家务至待办状态
    undoHousework(completedRecordId) {
        // 找到完成记录
        var recordIndex = this.completedHousework.findIndex(record => record.id === completedRecordId);
        if (recordIndex === -1) {
            this.showNotification('未找到完成记录', 'warning');
            return;
        }
        
        var record = this.completedHousework[recordIndex];
        
        // 从完成记录中移除
        this.completedHousework.splice(recordIndex, 1);
        
        // 保存数据并刷新界面
        this.saveData();
        this.loadFamilyData();
        
        this.showNotification('家务「' + record.title + '」已退回待办', 'success');
    }
    
    // 取消家务延期
    cancelPostponedHousework(houseworkId) {
        // 找到已延期的家务
        var housework = this.houseworkReminders.find(hw => hw.id === houseworkId);
        if (!housework || !housework.isPostponed) {
            this.showNotification('未找到已延期的家务', 'warning');
            return;
        }
        
        // 取消延期状态
        delete housework.isPostponed;
        delete housework.postponedDate;
        
        // 保存数据并刷新界面
        this.saveData();
        this.loadFamilyData();
        
        this.showNotification('家务「' + housework.title + '」延期已取消', 'success');
    }
}

// 初始化
var familyTaskSystem;
document.addEventListener('DOMContentLoaded', function() {
    familyTaskSystem = new FamilyTaskSystem();
});