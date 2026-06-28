(function() {
    // ==========================================
    // ENCAPSULATED STATE
    // ==========================================
    const state = {
        learnedSkills: new Set(),
        historyData: [],
        currentAnalysisData: null,
        currentMockTest: []
    };

    // Initialize PDF.js worker
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

    // ==========================================
    // EVENT DELEGATION & INITIALIZATION
    // ==========================================
    document.addEventListener('DOMContentLoaded', () => {
        loadMe();

        // Static Event Listeners
        document.getElementById('logoutBtn')?.addEventListener('click', logout);
        document.getElementById('resumeUpload')?.addEventListener('change', handleFileUpload);
        document.getElementById('clearFormBtn')?.addEventListener('click', clearForm);
        document.getElementById('generateAnalysisBtn')?.addEventListener('click', generateAnalysis);
        document.getElementById('tabAnalysis')?.addEventListener('click', () => showTab('analysis'));
        document.getElementById('tabMockTest')?.addEventListener('click', () => showTab('mocktest'));
        document.getElementById('tabHistory')?.addEventListener('click', () => showTab('history'));
        document.getElementById('refreshHistoryBtn')?.addEventListener('click', loadHistory);
        document.getElementById('generateTestBtn')?.addEventListener('click', generateMockTest);

        // Event Delegation for Result Area (Recalculate & Skills)
        const resultArea = document.getElementById('resultArea');
        if (resultArea) {
            resultArea.addEventListener('click', (e) => {
                if (e.target.classList.contains('skill-tag-missing')) {
                    const skillName = e.target.getAttribute('data-skill');
                    if (skillName) toggleSkill(e.target, skillName);
                } else if (e.target.closest('.recalculate-btn')) {
                    recalculateAnalysis();
                }
            });
        }

        // Event Delegation for History List
        const historyList = document.getElementById('historyList');
        if (historyList) {
            historyList.addEventListener('click', (e) => {
                const btn = e.target.closest('.mini-btn');
                if (btn) {
                    const action = btn.getAttribute('data-action');
                    const id = parseInt(btn.getAttribute('data-id'), 10);
                    if (action === 'view') viewHistory(id);
                    if (action === 'favorite') toggleFavorite(id);
                    if (action === 'delete') deleteHistory(id);
                }
            });
        }

        // Event Delegation for Mock Test
        const mockTestResult = document.getElementById('mockTestResult');
        if (mockTestResult) {
            mockTestResult.addEventListener('click', (e) => {
                if (e.target.classList.contains('submit-test-btn')) {
                    submitMockTest();
                }
            });
        }

        // Event Delegation for Suggested Roles
        const suggestedRolesContainer = document.getElementById('suggestedRolesContainer');
        if (suggestedRolesContainer) {
            suggestedRolesContainer.addEventListener('click', (e) => {
                const roleSpan = e.target.closest('.suggested-role-tag');
                if (roleSpan) {
                    const role = roleSpan.getAttribute('data-role');
                    document.getElementById('goal').value = role;
                    Array.from(suggestedRolesContainer.children).forEach(c => c.style.background = 'rgba(139, 92, 246, 0.15)');
                    roleSpan.style.background = 'rgba(139, 92, 246, 0.4)';
                }
            });
            suggestedRolesContainer.addEventListener('mouseover', (e) => {
                const roleSpan = e.target.closest('.suggested-role-tag');
                if (roleSpan && roleSpan.style.background !== 'rgba(139, 92, 246, 0.4)') {
                    roleSpan.style.background = 'rgba(139, 92, 246, 0.3)';
                }
            });
            suggestedRolesContainer.addEventListener('mouseout', (e) => {
                const roleSpan = e.target.closest('.suggested-role-tag');
                if (roleSpan && roleSpan.style.background !== 'rgba(139, 92, 246, 0.4)') {
                    roleSpan.style.background = 'rgba(139, 92, 246, 0.15)';
                }
            });
        }
    });

    // ==========================================
    // HELPERS
    // ==========================================
    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    async function extractTextFromPDF(file) {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let fullText = "";

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(" ");
            fullText += pageText + "\n";
        }
        return fullText;
    }

    // ==========================================
    // UI MANAGEMENT
    // ==========================================
    function clearForm() {
        document.getElementById('profileForm').reset();
        const uploadStatus = document.getElementById('uploadStatus');
        if (uploadStatus) {
            uploadStatus.style.display = 'none';
            uploadStatus.textContent = '';
        }
        resetResultArea();
    }

    function resetResultArea() {
        const resultArea = document.getElementById('resultArea');
        if (!resultArea) return;
        resultArea.style.display = 'flex';
        resultArea.style.justifyContent = 'center';
        resultArea.style.alignItems = 'center';
        
        resultArea.innerHTML = '';
        
        const emptyState = document.createElement('div');
        emptyState.className = 'empty-state';
        
        const iconDiv = document.createElement('div');
        iconDiv.className = 'target-icon float-animation';
        iconDiv.innerHTML = '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M22 12h-4"></path><path d="M6 12H2"></path><path d="M12 2v4"></path><path d="M12 22v-4"></path></svg>';
        
        const h2 = document.createElement('h2');
        h2.textContent = 'Awaiting Analysis';
        
        const p = document.createElement('p');
        p.textContent = 'Upload a resume or fill in your details to discover your personalized skills gap roadmap against industry demand.';
        
        emptyState.appendChild(iconDiv);
        emptyState.appendChild(h2);
        emptyState.appendChild(p);
        resultArea.appendChild(emptyState);

        const overlay = document.getElementById('loadingOverlay');
        if (overlay) overlay.style.display = 'none';
    }

    function showTab(tab) {
        const analysisBtn = document.getElementById('tabAnalysis');
        const historyBtn = document.getElementById('tabHistory');
        const mockTestBtn = document.getElementById('tabMockTest');
        const analysisPanel = document.getElementById('analysisTab');
        const historyPanel = document.getElementById('historyTab');
        const mockTestPanel = document.getElementById('mockTestTab');

        if (tab === 'history' && historyBtn && historyBtn.disabled) return;

        [analysisBtn, historyBtn, mockTestBtn].forEach(btn => btn && btn.classList.remove('tab-active'));
        [analysisPanel, historyPanel, mockTestPanel].forEach(panel => panel && panel.classList.remove('tab-panel-active'));

        if (tab === 'history') {
            if (historyBtn) historyBtn.classList.add('tab-active');
            if (historyPanel) historyPanel.classList.add('tab-panel-active');
            loadHistory();
        } else if (tab === 'mocktest') {
            if (mockTestBtn) mockTestBtn.classList.add('tab-active');
            if (mockTestPanel) mockTestPanel.classList.add('tab-panel-active');
        } else {
            if (analysisBtn) analysisBtn.classList.add('tab-active');
            if (analysisPanel) analysisPanel.classList.add('tab-panel-active');
        }
    }

    function toggleSkill(element, skillName) {
        if (state.learnedSkills.has(skillName)) {
            state.learnedSkills.delete(skillName);
            element.classList.remove('selected');
        } else {
            state.learnedSkills.add(skillName);
            element.classList.add('selected');
        }
    }

    // ==========================================
    // AUTHENTICATION
    // ==========================================
    async function logout() {
        localStorage.removeItem('skillgap_token');
        try { await fetch('/auth/logout', { method: 'POST' }); } catch (e) { }
        window.location.href = 'index.html'; 
    }

    async function loadMe() {
        try {
            const token = localStorage.getItem('skillgap_token');
            const badge = document.getElementById('userBadge');
            const logoutBtn = document.getElementById('logoutBtn');
            const historyBtn = document.getElementById('tabHistory');

            if (!token) {
                if(badge) {
                    badge.style.display = 'inline-flex';
                    badge.textContent = 'Guest Mode';
                }
                if(logoutBtn) logoutBtn.style.display = 'inline-flex';
                if (historyBtn) {
                    historyBtn.disabled = true;
                    historyBtn.title = 'Sign in to save and view history';
                }
                return;
            }

            const res = await fetch('/auth/me', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (data && data.loggedIn) {
                if(badge) {
                    badge.style.display = 'inline-flex';
                    badge.textContent = `User: ${data.username}`;
                }
                if(logoutBtn) logoutBtn.style.display = 'inline-flex';
            }
        } catch (e) {
            console.warn('Could not confirm auth status.');
        }
    }

    // ==========================================
    // HISTORY MANAGEMENT
    // ==========================================
    async function loadHistory() {
        const list = document.getElementById('historyList');
        if (!list) return;
        
        list.innerHTML = '';
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'result-content';
        loadingDiv.style.background = 'transparent';
        loadingDiv.style.padding = '18px';
        loadingDiv.textContent = 'Loading...';
        list.appendChild(loadingDiv);

        try {
            const token = localStorage.getItem('skillgap_token');
            const res = await fetch('/api/history?limit=30', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            list.innerHTML = ''; // Clear loading
            
            if (!res.ok) {
                const errorDiv = document.createElement('div');
                errorDiv.className = 'result-content';
                errorDiv.style.color = '#f87171';
                errorDiv.style.background = 'rgba(239, 68, 68, 0.1)';
                errorDiv.textContent = 'Failed to load history.';
                list.appendChild(errorDiv);
                return;
            }
            
            const data = await res.json();
            const history = (data && data.history) ? data.history : [];
            state.historyData = history;
            
            if (history.length === 0) {
                const emptyDiv = document.createElement('div');
                emptyDiv.className = 'result-content';
                emptyDiv.style.background = 'transparent';
                emptyDiv.style.padding = '18px';
                emptyDiv.textContent = 'No history yet. Generate a roadmap to create one.';
                list.appendChild(emptyDiv);
                return;
            }

            history.forEach(h => {
                const goal = h.goal && h.goal !== 'Not Specified' ? h.goal : 'Untitled';
                const favIconText = h.is_favorite ? '❤️' : '🤍';

                const itemDiv = document.createElement('div');
                itemDiv.className = 'history-item';

                const metaDiv = document.createElement('div');
                metaDiv.className = 'history-meta';
                const goalDiv = document.createElement('div');
                goalDiv.className = 'history-goal';
                goalDiv.textContent = `${h.is_favorite ? '❤️ ' : ''}${goal}`;
                const timeDiv = document.createElement('div');
                timeDiv.className = 'history-time';
                timeDiv.textContent = 'Recent Search';
                metaDiv.appendChild(goalDiv);
                metaDiv.appendChild(timeDiv);

                const actionsDiv = document.createElement('div');
                actionsDiv.className = 'history-actions';
                
                const viewBtn = document.createElement('button');
                viewBtn.className = 'mini-btn';
                viewBtn.setAttribute('data-action', 'view');
                viewBtn.setAttribute('data-id', h.id);
                viewBtn.textContent = 'View';
                
                const favBtn = document.createElement('button');
                favBtn.className = 'mini-btn';
                favBtn.setAttribute('data-action', 'favorite');
                favBtn.setAttribute('data-id', h.id);
                favBtn.textContent = favIconText;

                const delBtn = document.createElement('button');
                delBtn.className = 'mini-btn';
                delBtn.setAttribute('data-action', 'delete');
                delBtn.setAttribute('data-id', h.id);
                delBtn.textContent = '🗑️';

                actionsDiv.appendChild(viewBtn);
                actionsDiv.appendChild(favBtn);
                actionsDiv.appendChild(delBtn);

                itemDiv.appendChild(metaDiv);
                itemDiv.appendChild(actionsDiv);
                list.appendChild(itemDiv);
            });
        } catch (e) {
            list.innerHTML = '';
            const errDiv = document.createElement('div');
            errDiv.className = 'result-content';
            errDiv.style.color = '#f87171';
            errDiv.style.background = 'rgba(239, 68, 68, 0.1)';
            errDiv.textContent = 'Failed to load history.';
            list.appendChild(errDiv);
        }
    }

    async function toggleFavorite(id) {
        try {
            const token = localStorage.getItem('skillgap_token');
            await fetch(`/api/history/${id}/favorite`, { 
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            loadHistory();
        } catch (e) {
            console.error('Failed to toggle favorite', e);
        }
    }

    async function deleteHistory(id) {
        if (!confirm('Are you sure you want to delete this search?')) return;
        try {
            const token = localStorage.getItem('skillgap_token');
            await fetch(`/api/history/${id}`, { 
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            loadHistory();
        } catch (e) {
            console.error('Failed to delete', e);
        }
    }

    function viewHistory(id) {
        if (!state.historyData) return;
        const historyItem = state.historyData.find(h => h.id === id);
        if (!historyItem || !historyItem.result_json) return;

        try {
            const parsedData = JSON.parse(historyItem.result_json);
            
            const goalInput = document.getElementById('goal');
            if (goalInput) goalInput.value = historyItem.goal || '';

            showTab('analysis');

            const resultArea = document.getElementById('resultArea');
            const overlay = document.getElementById('loadingOverlay');
            const emptyState = document.querySelector('.empty-state');

            if (overlay) overlay.style.display = 'none';
            if (emptyState) emptyState.style.display = 'none';
            
            resultArea.style.display = 'block';
            state.currentAnalysisData = parsedData;
            
            resultArea.innerHTML = '';
            const resultContent = document.createElement('div');
            resultContent.className = 'result-content';
            resultContent.style.background = 'transparent';
            resultContent.appendChild(buildUIFromJson(parsedData));
            resultArea.appendChild(resultContent);
            
            if (parsedData.stats) {
                renderRadarChart(parsedData.stats);
                renderMatchPercentageChart(parsedData.stats);
            }
        } catch (e) {
            console.error("Failed to parse history JSON", e);
            alert("Could not load this history item.");
        }
    }

    // ==========================================
    // DOM CONSTRUCTION & RENDERING
    // ==========================================
    function buildUIFromJson(data) {
        const container = document.createElement('div');
        container.style.animation = 'fadeIn 0.5s ease-out';
        container.style.width = '100%';

        if (!data || !data.stats) {
            const errorDiv = document.createElement('div');
            errorDiv.className = 'result-content';
            errorDiv.style.color = '#f87171';
            errorDiv.textContent = 'Invalid data format. Expected JSON.';
            container.appendChild(errorDiv);
            return container;
        }

        const { stats, roadmap, courses } = data;
        const goalInput = document.getElementById('goal');
        const goalText = (goalInput && goalInput.value) ? goalInput.value : "your target role";
        
        // Header
        const headerDiv = document.createElement('div');
        headerDiv.style.display = 'flex';
        headerDiv.style.justifyContent = 'space-between';
        headerDiv.style.alignItems = 'center';
        headerDiv.style.marginBottom = '24px';
        const h2 = document.createElement('h2');
        h2.style.color = '#f3f4f6';
        h2.style.fontSize = '1.5rem';
        h2.style.fontFamily = "'Outfit', sans-serif";
        h2.textContent = 'Career Roadmap Analysis';
        headerDiv.appendChild(h2);
        container.appendChild(headerDiv);
        
        // Grid
        const gridDiv = document.createElement('div');
        gridDiv.style.display = 'grid';
        gridDiv.style.gridTemplateColumns = '1fr 1fr';
        gridDiv.style.gap = '20px';
        gridDiv.style.marginBottom = '20px';
        
        const createChartContainer = (title, canvasId) => {
            const card = document.createElement('div');
            card.style.background = 'rgba(255, 255, 255, 0.02)';
            card.style.border = '1px solid rgba(255, 255, 255, 0.08)';
            card.style.padding = '18px';
            card.style.borderRadius = '12px';
            card.style.display = 'flex';
            card.style.flexDirection = 'column';
            card.style.justifyContent = 'center';
            card.style.alignItems = 'center';
            card.style.minHeight = '350px';

            const h3 = document.createElement('h3');
            h3.style.color = '#f3f4f6';
            h3.style.marginBottom = '15px';
            h3.style.fontSize = '1.1rem';
            h3.style.width = '100%';
            h3.style.textAlign = 'left';
            h3.textContent = title;
            
            const canvasContainer = document.createElement('div');
            canvasContainer.style.position = 'relative';
            canvasContainer.style.height = '280px';
            canvasContainer.style.width = '100%';
            if (canvasId === 'matchPercentageChart') {
                canvasContainer.style.display = 'flex';
                canvasContainer.style.justifyContent = 'center';
            }
            
            const canvas = document.createElement('canvas');
            canvas.id = canvasId;
            canvasContainer.appendChild(canvas);
            
            card.appendChild(h3);
            card.appendChild(canvasContainer);
            return card;
        };
        
        gridDiv.appendChild(createChartContainer('Role Match', 'matchPercentageChart'));
        gridDiv.appendChild(createChartContainer('Skill Proficiency by Domain', 'radarChartCanvas'));
        container.appendChild(gridDiv);

        const buildTags = (parent, arr, bg, text, border, isMissing = false) => {
            if (!arr || arr.length === 0) {
                const span = document.createElement('span');
                span.style.color = '#9ca3af';
                span.style.fontSize = '0.9rem';
                span.textContent = 'None found.';
                parent.appendChild(span);
                return;
            }
            arr.forEach(s => {
                const name = typeof s === 'object' && s !== null ? s.name : s;
                const span = document.createElement('span');
                if (isMissing) {
                    span.className = 'skill-tag-missing';
                    if (state.learnedSkills.has(name)) span.classList.add('selected');
                    span.setAttribute('data-skill', name);
                    span.textContent = name;
                } else {
                    span.style.background = bg;
                    span.style.color = text;
                    span.style.padding = '6px 12px';
                    span.style.borderRadius = '20px';
                    span.style.fontSize = '0.85rem';
                    span.style.fontWeight = '500';
                    span.style.border = `1px solid ${border}`;
                    span.textContent = name;
                }
                parent.appendChild(span);
            });
        };

        // Matched Skills
        const matchedDiv = document.createElement('div');
        matchedDiv.style.background = 'rgba(16, 185, 129, 0.05)';
        matchedDiv.style.borderLeft = '4px solid #10b981';
        matchedDiv.style.padding = '18px';
        matchedDiv.style.borderRadius = '12px';
        matchedDiv.style.marginBottom = '20px';
        matchedDiv.style.border = '1px solid rgba(16, 185, 129, 0.15)';
        matchedDiv.style.borderLeftWidth = '4px';

        const matchedH3 = document.createElement('h3');
        matchedH3.style.color = '#34d399';
        matchedH3.style.marginBottom = '12px';
        matchedH3.style.fontSize = '1.1rem';
        matchedH3.style.display = 'flex';
        matchedH3.style.alignItems = 'center';
        matchedH3.style.gap = '8px';
        matchedH3.textContent = 'Skills Matched';
        matchedDiv.appendChild(matchedH3);

        const matchedTags = document.createElement('div');
        matchedTags.style.display = 'flex';
        matchedTags.style.flexWrap = 'wrap';
        matchedTags.style.gap = '8px';
        buildTags(matchedTags, roadmap.matched, 'rgba(16, 185, 129, 0.15)', '#a7f3d0', 'rgba(16, 185, 129, 0.3)', false);
        matchedDiv.appendChild(matchedTags);
        container.appendChild(matchedDiv);

        // Missing Skills
        const missingDiv = document.createElement('div');
        missingDiv.style.background = 'rgba(245, 158, 11, 0.05)';
        missingDiv.style.borderLeft = '4px solid #f59e0b';
        missingDiv.style.padding = '18px';
        missingDiv.style.borderRadius = '12px';
        missingDiv.style.marginBottom = '20px';
        missingDiv.style.border = '1px solid rgba(245, 158, 11, 0.15)';
        missingDiv.style.borderLeftWidth = '4px';

        const missingHeader = document.createElement('div');
        missingHeader.style.display = 'flex';
        missingHeader.style.justifyContent = 'space-between';
        missingHeader.style.alignItems = 'center';
        missingHeader.style.marginBottom = '10px';
        
        const missingH3 = document.createElement('h3');
        missingH3.style.color = '#fbbf24';
        missingH3.style.margin = '0';
        missingH3.style.fontSize = '1.1rem';
        missingH3.style.display = 'flex';
        missingH3.style.alignItems = 'center';
        missingH3.style.gap = '8px';
        missingH3.textContent = 'Skills Gap (Missing from Industry Standard)';
        missingHeader.appendChild(missingH3);
        missingDiv.appendChild(missingHeader);

        const missingP = document.createElement('p');
        missingP.style.fontSize = '0.9rem';
        missingP.style.color = '#d1d5db';
        missingP.style.marginBottom = '14px';
        missingP.innerHTML = `Highly requested for <strong>${escapeHtml(goalText)}</strong> but missing from your profile. Click skills you have learned to mark them.`;
        missingDiv.appendChild(missingP);

        const missingTags = document.createElement('div');
        missingTags.style.display = 'flex';
        missingTags.style.flexWrap = 'wrap';
        missingTags.style.gap = '8px';
        missingTags.style.marginBottom = '14px'; // Added spacing
        buildTags(missingTags, roadmap.missing, 'rgba(245, 158, 11, 0.15)', '#fde68a', 'rgba(245, 158, 11, 0.3)', true);
        missingDiv.appendChild(missingTags);

        const recalcBtn = document.createElement('button');
        recalcBtn.className = 'recalculate-btn';
        recalcBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/></svg> Recalculate Progress';
        missingDiv.appendChild(recalcBtn);
        container.appendChild(missingDiv);

        // Courses
        const coursesDiv = document.createElement('div');
        coursesDiv.style.background = 'rgba(139, 92, 246, 0.05)';
        coursesDiv.style.borderLeft = '4px solid #8b5cf6';
        coursesDiv.style.padding = '18px';
        coursesDiv.style.borderRadius = '12px';
        coursesDiv.style.marginBottom = '20px';
        coursesDiv.style.border = '1px solid rgba(139, 92, 246, 0.15)';
        coursesDiv.style.borderLeftWidth = '4px';

        const coursesH3 = document.createElement('h3');
        coursesH3.style.color = '#c4b5fd';
        coursesH3.style.marginBottom = '6px';
        coursesH3.style.fontSize = '1.1rem';
        coursesH3.style.display = 'flex';
        coursesH3.style.alignItems = 'center';
        coursesH3.style.gap = '8px';
        coursesH3.textContent = 'Recommended Courses to Learn';
        coursesDiv.appendChild(coursesH3);

        const coursesGrid = document.createElement('div');
        coursesGrid.className = 'course-grid';
        
        if (!courses || courses.length === 0) {
            const p = document.createElement('p');
            p.style.color = '#9ca3af';
            p.style.fontSize = '0.9rem';
            p.textContent = 'No specific courses recommended at this time.';
            coursesGrid.appendChild(p);
        } else {
            courses.forEach(c => {
                const card = document.createElement('div');
                card.className = 'course-card';
                card.style.display = 'flex';
                card.style.flexDirection = 'column';
                card.style.gap = '4px';

                const cName = document.createElement('span');
                cName.className = 'course-name';
                cName.style.fontWeight = '600';
                cName.textContent = c.name;

                const cProv = document.createElement('span');
                cProv.className = 'course-provider';
                cProv.style.color = '#8b5cf6';
                cProv.style.fontSize = '0.8rem';
                cProv.style.textTransform = 'uppercase';
                cProv.textContent = c.provider;

                card.appendChild(cName);
                card.appendChild(cProv);
                coursesGrid.appendChild(card);
            });
        }
        coursesDiv.appendChild(coursesGrid);
        container.appendChild(coursesDiv);

        return container;
    }

    function renderMatchPercentageChart(stats) {
        const ctx = document.getElementById('matchPercentageChart');
        if (!ctx) return;

        const matchedPercentage = stats.percentages.matched || 0;
        const missingPercentage = 100 - matchedPercentage;

        new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Matched Skills', 'Missing Skills'],
                datasets: [{
                    data: [matchedPercentage, missingPercentage],
                    backgroundColor: ['#10b981', '#f59e0b'],
                    borderWidth: 0,
                    hoverOffset: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '75%',
                plugins: {
                    legend: { 
                        position: 'bottom',
                        labels: { color: '#f3f4f6', font: { family: "'Outfit', sans-serif" }, padding: 20 }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return context.label + ': ' + context.parsed + '%';
                            }
                        }
                    }
                }
            },
            plugins: [{
                id: 'textCenter',
                beforeDraw: function(chart) {
                    var width = chart.width,
                        height = chart.height,
                        ctx = chart.ctx;

                    ctx.restore();
                    var fontSize = (height / 114).toFixed(2);
                    ctx.font = "bold " + fontSize + "em 'Outfit', sans-serif";
                    ctx.textBaseline = "middle";
                    ctx.fillStyle = "#f3f4f6";

                    var text = matchedPercentage + "%",
                        textX = Math.round((width - ctx.measureText(text).width) / 2),
                        textY = (height / 2) - 10;

                    ctx.fillText(text, textX, textY);
                    ctx.save();
                }
            }]
        });
    }

    function renderRadarChart(stats) {
        const ctx = document.getElementById('radarChartCanvas');
        if (!ctx) return;

        const domains = stats.domains || {};
        const labels = Object.keys(domains);
        
        if (labels.length === 0) {
            labels.push('General');
            domains['General'] = { total_weight: 1, matched_weight: stats.percentages.matched ? 1 : 0 };
        }

        const dataPoints = labels.map(label => {
            const d = domains[label];
            return d.total_weight > 0 ? (d.matched_weight / d.total_weight) * 100 : 0;
        });

        new Chart(ctx, {
            type: 'radar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Skill Proficiency (%)',
                    data: dataPoints,
                    backgroundColor: 'rgba(139, 92, 246, 0.4)',
                    borderColor: 'rgba(139, 92, 246, 1)',
                    pointBackgroundColor: 'rgba(139, 92, 246, 1)',
                    pointBorderColor: '#fff',
                    pointHoverBackgroundColor: '#fff',
                    pointHoverBorderColor: 'rgba(139, 92, 246, 1)',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    r: {
                        angleLines: { color: 'rgba(255, 255, 255, 0.1)' },
                        grid: { color: 'rgba(255, 255, 255, 0.1)' },
                        pointLabels: { color: '#d1d5db', font: { size: 14, family: "'Outfit', sans-serif" } },
                        ticks: { display: false, min: 0, max: 100, stepSize: 20 }
                    }
                },
                plugins: {
                    legend: { labels: { color: '#f3f4f6', font: { family: "'Outfit', sans-serif" } } }
                }
            }
        });
    }

    // ==========================================
    // CORE FUNCTIONALITY
    // ==========================================
    async function generateAnalysis() {
        const goalInput = document.getElementById('goal');
        const skillsInput = document.getElementById('skills');
        const scoresInput = document.getElementById('scores');
        const experienceInput = document.getElementById('experience');

        const goal = goalInput ? goalInput.value : '';
        const skills = skillsInput ? skillsInput.value : '';
        const scores = scoresInput ? scoresInput.value : '';
        const experience = experienceInput ? experienceInput.value : '';

        const resultArea = document.getElementById('resultArea');
        const overlay = document.getElementById('loadingOverlay');

        const safeGoal = goal && goal.trim() !== '' ? goal.trim() : '';
        const safeSkills = skills && skills.trim() !== '' ? skills.trim() : '';
        if (!safeGoal || !safeSkills) {
            alert('Target Role and Current Skills are required!');
            return;
        }

        state.learnedSkills = new Set();
        showTab('analysis');
        
        const mockTestResult = document.getElementById('mockTestResult');
        if (mockTestResult) {
            mockTestResult.innerHTML = '';
            const emptyDiv = document.createElement('div');
            emptyDiv.className = 'empty-state';
            emptyDiv.innerHTML = '<div class="target-icon float-animation"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg></div><h2>Ready to Practice?</h2><p>Enter your Target Role on the left and click \'Generate Test\' to get custom interview questions.</p>';
            mockTestResult.appendChild(emptyDiv);
        }

        if(resultArea) resultArea.style.display = 'none';
        if (overlay) {
            overlay.style.display = 'flex';
            const h3 = overlay.querySelector('h3');
            if (h3) h3.textContent = 'Analyzing Profile...';
        }

        try {
            const token = localStorage.getItem('skillgap_token');
            const response = await fetch('/analyze', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': token ? `Bearer ${token}` : ''
                },
                body: JSON.stringify({ goal, skills, scores, experience })
            });

            if (!response.ok) {
                let backendErrorMsg = 'Analysis Failed.';
                try {
                    const errorData = await response.json();
                    backendErrorMsg = errorData.error || backendErrorMsg;
                } catch(e) {}
                throw new Error(backendErrorMsg);
            }

            const data = await response.json();

            if (overlay) overlay.style.display = 'none';
            if (resultArea) resultArea.style.display = 'block';

            state.currentAnalysisData = data;
            
            if (resultArea) {
                resultArea.innerHTML = '';
                const resultContent = document.createElement('div');
                resultContent.className = 'result-content';
                resultContent.style.background = 'transparent';
                resultContent.appendChild(buildUIFromJson(data));
                resultArea.appendChild(resultContent);
            }

            if (data.stats) {
                renderRadarChart(data.stats);
                renderMatchPercentageChart(data.stats);
            }

        } catch (error) {
            if (overlay) overlay.style.display = 'none';
            if (resultArea) {
                resultArea.style.display = 'flex';
                resultArea.innerHTML = '';
                const errDiv = document.createElement('div');
                errDiv.className = 'result-content';
                errDiv.style.color = '#f87171';
                errDiv.textContent = `Error: ${error.message}`;
                resultArea.appendChild(errDiv);
            }
        }
    }

    async function recalculateAnalysis() {
        if (!state.currentAnalysisData || !state.currentAnalysisData.roadmap) return;
        
        if (state.learnedSkills.size === 0) {
            alert("Please click on at least one skill you've learned before recalculating!");
            return;
        }

        const goalInput = document.getElementById('goal');
        const skillsInput = document.getElementById('skills');
        const scoresInput = document.getElementById('scores');
        const experienceInput = document.getElementById('experience');

        const goal = goalInput ? goalInput.value : '';
        const currentSkillsInput = skillsInput ? skillsInput.value : '';
        const scores = scoresInput ? scoresInput.value : '';
        const experience = experienceInput ? experienceInput.value : '';

        const learnedSkillsArray = Array.from(state.learnedSkills);
        const updatedSkills = currentSkillsInput ? currentSkillsInput + ", " + learnedSkillsArray.join(", ") : learnedSkillsArray.join(", ");
        
        if(skillsInput) skillsInput.value = updatedSkills;

        const originalRoadmap = state.currentAnalysisData.roadmap;
        const marketSkills = [
            ...originalRoadmap.matched.map(m => ({ name: m.name, domain: m.domain, type: "Unknown" })),
            ...originalRoadmap.missing.map(m => ({ name: m.name, domain: m.domain, type: "Unknown" }))
        ];

        const resultArea = document.getElementById('resultArea');
        const overlay = document.getElementById('loadingOverlay');

        if(resultArea) resultArea.style.display = 'none';
        if (overlay) {
            overlay.style.display = 'flex';
            const h3 = overlay.querySelector('h3');
            if (h3) h3.textContent = 'Recalculating Progress...';
        }

        try {
            const token = localStorage.getItem('skillgap_token');
            const response = await fetch('/analyze', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': token ? `Bearer ${token}` : ''
                },
                body: JSON.stringify({ goal, skills: updatedSkills, scores, experience, marketSkills })
            });

            if (!response.ok) {
                let backendErrorMsg = 'Recalculation Failed.';
                try {
                    const errorData = await response.json();
                    backendErrorMsg = errorData.error || backendErrorMsg;
                } catch(e) {}
                throw new Error(backendErrorMsg);
            }

            const data = await response.json();

            if (overlay) overlay.style.display = 'none';
            if (resultArea) resultArea.style.display = 'block';

            state.learnedSkills = new Set();
            state.currentAnalysisData = data;
            
            if (resultArea) {
                resultArea.innerHTML = '';
                const resultContent = document.createElement('div');
                resultContent.className = 'result-content';
                resultContent.style.background = 'transparent';
                resultContent.appendChild(buildUIFromJson(data));
                resultArea.appendChild(resultContent);
            }

            if (data.stats) {
                renderRadarChart(data.stats);
                renderMatchPercentageChart(data.stats);
            }

        } catch (error) {
            if (overlay) overlay.style.display = 'none';
            if (resultArea) {
                resultArea.style.display = 'flex';
                resultArea.innerHTML = '';
                const errDiv = document.createElement('div');
                errDiv.className = 'result-content';
                errDiv.style.color = '#f87171';
                errDiv.textContent = `Error: ${error.message}`;
                resultArea.appendChild(errDiv);
            }
        }
    }

    async function handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        const uploadStatus = document.getElementById('uploadStatus');
        if (!uploadStatus) return;
        uploadStatus.style.display = 'block';
        uploadStatus.textContent = 'Processing document securely...';
        uploadStatus.style.color = '#a78bfa';

        try {
            let extractedText = '';
            const fileName = file.name.toLowerCase();

            if (fileName.endsWith('.pdf') || file.type === 'application/pdf') {
                uploadStatus.textContent = 'Parsing PDF...';
                extractedText = await extractTextFromPDF(file);
            } else if (fileName.endsWith('.txt') || file.type === 'text/plain') {
                uploadStatus.textContent = 'Reading TXT file...';
                extractedText = await file.text();
            } else {
                throw new Error("Unsupported file format. Please upload a .PDF or .TXT file.");
            }

            uploadStatus.textContent = 'Contacting server...';
            const response = await fetch('/parse-resume', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: extractedText })
            });

            if (!response.ok) {
                let backendErrorMsg = '';
                try {
                    const errorData = await response.json();
                    backendErrorMsg = errorData.error;
                } catch(e) {}
                
                throw new Error(backendErrorMsg || `Server error (Status ${response.status}).`);
            }

            const data = await response.json();
            const parsedData = data.parsed;

            if (parsedData && parsedData.skills) {
                const skillsInput = document.getElementById('skills');
                const expInput = document.getElementById('experience');
                const skillsStr = Array.isArray(parsedData.skills) ? parsedData.skills.join(', ') : (parsedData.skills || '');
                if(skillsInput) skillsInput.value = skillsStr;
                if(expInput) expInput.value = parsedData.experience || '';
                
                uploadStatus.textContent = `Resume Parsed Successfully! Fetching suggestions...`;
                uploadStatus.style.color = '#46b089ff';

                try {
                    const rolesRes = await fetch('/suggest-roles', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ skills: skillsStr, experience: expInput ? expInput.value : '' })
                    });
                    if (rolesRes.ok) {
                        const rolesData = await rolesRes.json();
                        if (rolesData.suggestedRoles) {
                            displaySuggestedRoles(rolesData.suggestedRoles);
                        }
                        uploadStatus.textContent = `Resume Parsed & Suggestions Loaded!`;
                    } else {
                        uploadStatus.textContent = `Resume Parsed (Suggestions Unavailable)`;
                    }
                } catch (e) {
                    uploadStatus.textContent = `Resume Parsed (Suggestions Unavailable)`;
                }
            } else if (parsedData) {
                const skillsInput = document.getElementById('skills');
                const expInput = document.getElementById('experience');
                if(skillsInput) skillsInput.value = parsedData.skills || '';
                if(expInput) expInput.value = parsedData.experience || '';
                uploadStatus.textContent = `Resume Parsed Successfully!`;
            }

        } catch (error) {
            console.error("Upload Error Details:", error); 
            uploadStatus.textContent = `Error: ${error.message || 'Failed to parse file.'}`;
            uploadStatus.style.color = '#f87171';
        }
    }

    function displaySuggestedRoles(roles) {
        const container = document.getElementById('suggestedRolesContainer');
        if (!container || !roles || roles.length === 0) return;
        
        container.innerHTML = '';
        roles.forEach(r => {
            const span = document.createElement('span');
            span.className = 'suggested-role-tag';
            span.setAttribute('data-role', r);
            span.style.background = 'rgba(139, 92, 246, 0.15)';
            span.style.color = '#c4b5fd';
            span.style.padding = '4px 10px';
            span.style.borderRadius = '12px';
            span.style.fontSize = '0.8rem';
            span.style.cursor = 'pointer';
            span.style.border = '1px solid rgba(139, 92, 246, 0.3)';
            span.style.transition = 'all 0.2s';
            span.textContent = `+ ${r}`;
            container.appendChild(span);
        });
        
        container.style.display = 'flex';
    }

    // ==========================================
    // MOCK TEST
    // ==========================================
    async function generateMockTest() {
        const goalInput = document.getElementById('goal');
        const goal = goalInput ? goalInput.value : '';
        if (!goal || goal.trim() === '') {
            alert('Please enter a Target Role first!');
            return;
        }

        const loading = document.getElementById('mockTestLoading');
        const resultDiv = document.getElementById('mockTestResult');

        if(loading) loading.style.display = 'flex';
        if(resultDiv) resultDiv.style.display = 'none';

        try {
            const response = await fetch('/generate-mock-test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ goal: goal.trim() })
            });

            if (!response.ok) {
                throw new Error('Failed to generate mock test. Please try again.');
            }

            const data = await response.json();
            const questions = data.questions || [];
            state.currentMockTest = questions;

            if (questions.length === 0) {
                if(resultDiv) {
                    resultDiv.innerHTML = '';
                    const emptyDiv = document.createElement('div');
                    emptyDiv.className = 'empty-state';
                    const p = document.createElement('p');
                    p.textContent = 'No questions could be generated. Please try a different role.';
                    emptyDiv.appendChild(p);
                    resultDiv.appendChild(emptyDiv);
                }
                return;
            }

            if(resultDiv) resultDiv.innerHTML = '';
            
            const groupDiv = document.createElement('div');
            groupDiv.className = 'skill-group';
            groupDiv.id = 'mockTestQuestionsContainer';

            questions.forEach((q, i) => {
                const qDiv = document.createElement('div');
                qDiv.className = 'skill-item mock-question';
                qDiv.style.display = 'block';
                qDiv.style.marginBottom = '15px';
                qDiv.style.background = 'rgba(255,255,255,0.03)';
                qDiv.style.border = '1px solid rgba(255,255,255,0.05)';
                qDiv.style.padding = '15px';
                qDiv.style.borderRadius = '8px';

                const qTitle = document.createElement('div');
                qTitle.style.fontWeight = '600';
                qTitle.style.color = '#f3f4f6';
                qTitle.style.marginBottom = '15px';
                qTitle.style.fontSize = '1.05rem';
                qTitle.textContent = `Q${i+1}: ${q.question}`;
                qDiv.appendChild(qTitle);

                const optionsContainer = document.createElement('div');
                optionsContainer.className = 'options-container';
                optionsContainer.style.marginBottom = '15px';
                optionsContainer.style.paddingLeft = '10px';

                if (q.options && Array.isArray(q.options)) {
                    q.options.forEach((opt, optIndex) => {
                        const optDiv = document.createElement('div');
                        optDiv.style.marginBottom = '8px';

                        const optId = `q${i}_opt${optIndex}`;
                        const radio = document.createElement('input');
                        radio.type = 'radio';
                        radio.id = optId;
                        radio.name = `q${i}`;
                        radio.value = opt;

                        const label = document.createElement('label');
                        label.htmlFor = optId;
                        label.style.color = '#d1d5db';
                        label.style.cursor = 'pointer';
                        label.style.marginLeft = '8px';
                        label.textContent = opt;

                        optDiv.appendChild(radio);
                        optDiv.appendChild(label);
                        optionsContainer.appendChild(optDiv);
                    });
                }
                qDiv.appendChild(optionsContainer);

                const feedback = document.createElement('div');
                feedback.className = 'feedback-msg';
                feedback.style.display = 'none';
                feedback.style.fontSize = '0.95rem';
                feedback.style.lineHeight = '1.5';
                feedback.style.marginTop = '10px';
                feedback.style.padding = '10px';
                feedback.style.borderRadius = '6px';
                feedback.style.background = 'rgba(0,0,0,0.2)';
                qDiv.appendChild(feedback);

                groupDiv.appendChild(qDiv);
            });

            if(resultDiv) resultDiv.appendChild(groupDiv);

            const submitContainer = document.createElement('div');
            submitContainer.style.marginTop = '20px';
            submitContainer.style.textAlign = 'center';

            const submitBtn = document.createElement('button');
            submitBtn.className = 'generate-btn submit-test-btn';
            submitBtn.style.padding = '10px 24px';
            submitBtn.style.marginBottom = '15px';
            submitBtn.style.width = 'auto';
            submitBtn.textContent = 'Submit Test';
            submitContainer.appendChild(submitBtn);

            const scoreContainer = document.createElement('div');
            scoreContainer.id = 'mockTestScoreContainer';
            scoreContainer.style.display = 'none';
            scoreContainer.style.padding = '20px';
            scoreContainer.style.borderRadius = '12px';
            scoreContainer.style.background = 'rgba(139, 92, 246, 0.1)';
            scoreContainer.style.border = '1px solid rgba(139, 92, 246, 0.3)';

            const scoreH3 = document.createElement('h3');
            scoreH3.style.color = '#f3f4f6';
            scoreH3.style.marginBottom = '10px';
            scoreH3.textContent = 'Your Score';
            scoreContainer.appendChild(scoreH3);

            const scoreText = document.createElement('div');
            scoreText.id = 'mockTestScoreText';
            scoreText.style.fontSize = '1.5rem';
            scoreText.style.fontWeight = 'bold';
            scoreText.style.color = '#c4b5fd';
            scoreContainer.appendChild(scoreText);

            submitContainer.appendChild(scoreContainer);
            if(resultDiv) resultDiv.appendChild(submitContainer);

        } catch (error) {
            if(resultDiv) {
                resultDiv.innerHTML = '';
                const errDiv = document.createElement('div');
                errDiv.className = 'empty-state';
                errDiv.style.color = '#f87171';
                errDiv.textContent = `Error: ${error.message}`;
                resultDiv.appendChild(errDiv);
            }
        } finally {
            if(loading) loading.style.display = 'none';
            if(resultDiv) resultDiv.style.display = 'block';
        }
    }

    function submitMockTest() {
        const questions = document.querySelectorAll('.mock-question');
        if (questions.length === 0) return;

        let score = 0;
        
        questions.forEach((container, i) => {
            const correctAnswer = state.currentMockTest[i]?.answer;
            const selectedOption = container.querySelector(`input[name="q${i}"]:checked`);
            const feedback = container.querySelector('.feedback-msg');
            
            feedback.style.display = 'block';
            
            if (!selectedOption) {
                feedback.style.color = '#f59e0b';
                feedback.style.borderLeft = '3px solid #f59e0b';
                feedback.textContent = `Unanswered. The correct answer is: ${correctAnswer}`;
            } else if (selectedOption.value === correctAnswer) {
                score++;
                feedback.style.color = '#10b981';
                feedback.style.borderLeft = '3px solid #10b981';
                feedback.innerHTML = `<strong>Correct!</strong> ${escapeHtml(correctAnswer)}`;
            } else {
                feedback.style.color = '#f87171';
                feedback.style.borderLeft = '3px solid #f87171';
                feedback.innerHTML = `<strong>Incorrect.</strong> The correct answer is: <br/><span style="color: #f3f4f6;">${escapeHtml(correctAnswer)}</span>`;
            }
            
            const inputs = container.querySelectorAll('input[type="radio"]');
            inputs.forEach(input => input.disabled = true);
        });

        const scoreContainer = document.getElementById('mockTestScoreContainer');
        const scoreText = document.getElementById('mockTestScoreText');
        if (scoreContainer && scoreText) {
            const percentage = Math.round((score / questions.length) * 100);
            scoreText.innerHTML = `${score} / ${questions.length} <span style="font-size: 1rem; color: #9ca3af; font-weight: normal; margin-left: 10px;">(${percentage}%)</span>`;
            scoreContainer.style.display = 'block';
        }
    }
})();
