// Estado Global do Aplicativo
let state = {
    transactions: [],
    recurring: [],
    budgets: {},
    rules: [],
    sortField: 'date',
    sortAsc: false
};

// Configurações do LocalStorage
const LOCAL_STORAGE_KEY = 'gr_controle_data';

// Categorias padrão
const CATEGORIES = [
    "Alimentação", 
    "Transporte", 
    "Moradia", 
    "Lazer & Cultura", 
    "Saúde & Bem-estar", 
    "Educação", 
    "Compras & Vestuário",
    "Viagens & Férias",
    "Contas & Serviços",
    "Investimentos",
    "Presentes & Doações",
    "Pets",
    "Impostos & Taxas",
    "Receitas", 
    "Outros"
];

// Paleta de cores HSL para o gráfico de categorias
const CATEGORY_COLORS = {
    "Alimentação": "hsl(14, 85%, 55%)",
    "Transporte": "hsl(199, 89%, 48%)",
    "Moradia": "hsl(271, 81%, 56%)",
    "Lazer & Cultura": "hsl(328, 86%, 56%)",
    "Saúde & Bem-estar": "hsl(168, 76%, 42%)",
    "Educação": "hsl(48, 89%, 50%)",
    "Compras & Vestuário": "hsl(25, 95%, 50%)",
    "Viagens & Férias": "hsl(187, 85%, 45%)",
    "Contas & Serviços": "hsl(205, 75%, 40%)",
    "Investimentos": "hsl(122, 50%, 45%)",
    "Presentes & Doações": "hsl(300, 60%, 50%)",
    "Pets": "hsl(35, 70%, 45%)",
    "Impostos & Taxas": "hsl(0, 60%, 40%)",
    "Receitas": "hsl(142, 69%, 58%)",
    "Outros": "hsl(215, 16%, 47%)"
};

// Instâncias Globais dos Gráficos
let chartCashFlowInstance = null;
let chartCategoriesInstance = null;

// ==========================================
// 1. CARREGAMENTO E MOCK DATA
// ==========================================

function getTodayString() {
    const today = new Date();
    return today.toISOString().split('T')[0];
}

function getPastDateString(daysAgo) {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    return date.toISOString().split('T')[0];
}

// Inicializa o estado com dados vazios pronto para uso
function initializeMockData() {
    state.transactions = [];
    state.recurring = [];
    state.budgets = {};
    state.rules = [];
}

function loadState() {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (saved) {
        try {
            state = JSON.parse(saved);
            // Garantir ordenação padrão se não salva
            if (!state.sortField) {
                state.sortField = 'date';
                state.sortAsc = false;
            }
        } catch (e) {
            console.error("Erro ao carregar dados salvos. Resetando para demonstração.");
            initializeMockData();
            saveState();
        }
    } else {
        initializeMockData();
        saveState();
    }
}

function saveState() {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state));
}

// ==========================================
// 2. LOGICA DE CÁLCULO E RENDERS
// ==========================================

function formatCurrency(val) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
}

function getMonthYearString(dateStr) {
    // Retorna "YYYY-MM"
    return dateStr.substring(0, 7);
}

function getCurrentMonthString() {
    const today = new Date();
    return today.toISOString().substring(0, 7); // "YYYY-MM"
}

function getPreviousMonthString() {
    const today = new Date();
    let month = today.getMonth(); // 0-11 (mês atual)
    let year = today.getFullYear();
    if (month === 0) { // Janeiro
        month = 11; // Dezembro
        year -= 1;
    } else {
        month -= 1;
    }
    return `${year}-${String(month + 1).padStart(2, '0')}`;
}

// Processar regras automáticas de categorias baseadas na descrição
function checkAutoCategory(description) {
    if (!description) return null;
    const descLower = description.toLowerCase();
    for (const rule of state.rules) {
        if (descLower.includes(rule.keyword.toLowerCase())) {
            return rule.category;
        }
    }
    return null;
}

// Lança transações recorrentes automáticas na inicialização se ainda não foram lançadas este mês
function checkAndApplyRecurring() {
    const currentMonthStr = getCurrentMonthString();
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth(); // 0-11

    let appliedAny = false;

    state.recurring.forEach(rec => {
        // Formatar o nome do lançamento recorrente para evitar duplicações
        const recurringTitle = `[R] ${rec.description}`;
        
        // Verifica se já existe um lançamento com esse título no mês corrente
        const alreadyExists = state.transactions.some(t => {
            return t.description === recurringTitle && getMonthYearString(t.date) === currentMonthStr;
        });

        if (!alreadyExists) {
            // Criar data de lançamento baseada no dia agendado
            let targetDay = Math.min(rec.day, 28); // Limita a 28 para evitar estouro de fevereiro/meses curtos
            const transDateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`;
            
            state.transactions.push({
                id: `t-rec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                date: transDateStr,
                description: recurringTitle,
                category: rec.category,
                type: rec.type,
                amount: rec.amount,
                account: rec.account,
                status: 'pago' // lançamentos recorrentes entram quitados por padrão
            });
            appliedAny = true;
        }
    });

    if (appliedAny) {
        saveState();
    }
}

// Atualiza os Cards de Métrica (KPIs)
function updateKpiCards() {
    const currentMonthStr = getCurrentMonthString();
    const prevMonthStr = getPreviousMonthString();
    
    // Saldo Total Histórico (todas as transações registradas)
    let totalBalance = 0;
    state.transactions.forEach(t => {
        if (t.type === 'receita') {
            totalBalance += t.amount;
        } else {
            totalBalance -= t.amount;
        }
    });
    
    // Mês Atual
    let curMonthIncome = 0;
    let curMonthExpense = 0;
    
    // Mês Anterior (para cálculos de MoM%)
    let prevMonthIncome = 0;
    let prevMonthExpense = 0;
    
    // Dicionário para somar gastos por categoria no mês atual para o orçamento
    const categoryExpenses = {};
    CATEGORIES.forEach(c => categoryExpenses[c] = 0);

    state.transactions.forEach(t => {
        const tMonth = getMonthYearString(t.date);
        
        if (tMonth === currentMonthStr) {
            if (t.type === 'receita') {
                curMonthIncome += t.amount;
            } else {
                curMonthExpense += t.amount;
                categoryExpenses[t.category] = (categoryExpenses[t.category] || 0) + t.amount;
            }
        } else if (tMonth === prevMonthStr) {
            if (t.type === 'receita') {
                prevMonthIncome += t.amount;
            } else {
                prevMonthExpense += t.amount;
            }
        }
    });

    // Taxa de Poupança (Mês Atual)
    let savingsRate = 0;
    if (curMonthIncome > 0) {
        savingsRate = ((curMonthIncome - curMonthExpense) / curMonthIncome) * 100;
        if (savingsRate < 0) savingsRate = 0;
    }

    // 1. Render Card Saldo
    const elValBalance = document.getElementById('valBalance');
    elValBalance.innerText = formatCurrency(totalBalance);
    const elCardBalance = document.getElementById('cardBalance');
    if (totalBalance < 0) {
        elCardBalance.style.boxShadow = "0 0 10px rgba(244, 63, 94, 0.2)";
    } else {
        elCardBalance.style.boxShadow = "var(--shadow-sm)";
    }

    // 2. Render Card Receita
    document.getElementById('valIncome').innerText = formatCurrency(curMonthIncome);
    const elFooterIncome = document.getElementById('footerIncome');
    if (prevMonthIncome > 0) {
        const change = ((curMonthIncome - prevMonthIncome) / prevMonthIncome) * 100;
        elFooterIncome.innerText = `${change >= 0 ? '+' : ''}${change.toFixed(1)}% vs mês anterior`;
        elFooterIncome.className = `kpi-footer ${change >= 0 ? 'positive' : 'negative'}`;
    } else {
        elFooterIncome.innerText = "Sem dados do mês anterior";
        elFooterIncome.className = "kpi-footer neutral";
    }

    // 3. Render Card Despesa
    document.getElementById('valExpense').innerText = formatCurrency(curMonthExpense);
    const elFooterExpense = document.getElementById('footerExpense');
    if (prevMonthExpense > 0) {
        const change = ((curMonthExpense - prevMonthExpense) / prevMonthExpense) * 100;
        elFooterExpense.innerText = `${change >= 0 ? '+' : ''}${change.toFixed(1)}% vs mês anterior`;
        // Para despesa, um aumento de gastos é vermelho e queda é verde
        elFooterExpense.className = `kpi-footer ${change > 0 ? 'negative' : 'positive'}`;
    } else {
        elFooterExpense.innerText = "Sem dados do mês anterior";
        elFooterExpense.className = "kpi-footer neutral";
    }

    // 4. Render Card Poupança
    document.getElementById('valSavings').innerText = `${savingsRate.toFixed(1)}%`;
    const elFooterSavings = document.getElementById('footerSavings');
    const savedAmount = Math.max(0, curMonthIncome - curMonthExpense);
    elFooterSavings.innerText = `Economizado: ${formatCurrency(savedAmount)}`;

    // 5. Orçamentos & Alertas de Limites
    let limitAlertsCount = 0;
    let totalConfiguredBudgets = Object.keys(state.budgets).length;
    
    Object.keys(state.budgets).forEach(cat => {
        const limit = state.budgets[cat];
        const spent = categoryExpenses[cat] || 0;
        if (spent > limit) {
            limitAlertsCount++;
        }
    });

    const elValAlerts = document.getElementById('valAlerts');
    const elFooterAlerts = document.getElementById('footerAlerts');
    const elCardAlerts = document.getElementById('cardAlerts');

    if (limitAlertsCount > 0) {
        elValAlerts.innerText = `${limitAlertsCount} Estourado${limitAlertsCount > 1 ? 's' : ''}`;
        elValAlerts.style.color = "var(--accent-red)";
        elFooterAlerts.innerText = "Atenção nos gastos por categoria!";
        elFooterAlerts.className = "kpi-footer negative";
        elCardAlerts.classList.add('limit-exceeded');
    } else if (totalConfiguredBudgets === 0) {
        elValAlerts.innerText = "Nenhum";
        elValAlerts.style.color = "var(--text-main)";
        elFooterAlerts.innerText = "Sem orçamentos definidos";
        elFooterAlerts.className = "kpi-footer neutral";
        elCardAlerts.classList.remove('limit-exceeded');
    } else {
        elValAlerts.innerText = "OK";
        elValAlerts.style.color = "var(--accent-green)";
        elFooterAlerts.innerText = "Todos os limites sob controle";
        elFooterAlerts.className = "kpi-footer positive";
        elCardAlerts.classList.remove('limit-exceeded');
    }
}

// Inicializa e Atualiza os Gráficos
function updateCharts() {
    const currentMonthStr = getCurrentMonthString();
    
    // ==========================================
    // Gráfico de Fluxo de Caixa (Últimos 4 Meses)
    // ==========================================
    
    // Encontrar os últimos 4 meses de histórico
    const months = [];
    const today = new Date();
    for (let i = 3; i >= 0; i--) {
        const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
        months.push(d.toISOString().substring(0, 7)); // "YYYY-MM"
    }

    const cashFlowData = {};
    months.forEach(m => {
        cashFlowData[m] = { income: 0, expense: 0 };
    });

    state.transactions.forEach(t => {
        const tMonth = getMonthYearString(t.date);
        if (cashFlowData[tMonth] !== undefined) {
            if (t.type === 'receita') {
                cashFlowData[tMonth].income += t.amount;
            } else {
                cashFlowData[tMonth].expense += t.amount;
            }
        }
    });

    // Mapear meses para exibir com nome formatado (ex: "Jan/26")
    const monthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    const labels = months.map(m => {
        const parts = m.split('-');
        const monthIndex = parseInt(parts[1], 10) - 1;
        const yearShort = parts[0].substring(2);
        return `${monthNames[monthIndex]}/${yearShort}`;
    });

    const incomeValues = months.map(m => cashFlowData[m].income);
    const expenseValues = months.map(m => cashFlowData[m].expense);

    if (chartCashFlowInstance) {
        chartCashFlowInstance.destroy();
    }

    const ctxCash = document.getElementById('chartCashFlow').getContext('2d');
    chartCashFlowInstance = new Chart(ctxCash, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Receitas',
                    data: incomeValues,
                    backgroundColor: 'rgba(16, 185, 129, 0.8)',
                    borderColor: 'rgb(16, 185, 129)',
                    borderWidth: 1,
                    borderRadius: 4
                },
                {
                    label: 'Despesas',
                    data: expenseValues,
                    backgroundColor: 'rgba(244, 63, 94, 0.8)',
                    borderColor: 'rgb(244, 63, 94)',
                    borderWidth: 1,
                    borderRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                    labels: { color: '#94a3b8', font: { family: 'Inter' } }
                },
                title: {
                    display: true,
                    text: 'Cash Flow Mensal',
                    color: '#f8fafc',
                    font: { family: 'Outfit', size: 14 }
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#94a3b8', font: { family: 'Inter' } }
                },
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#94a3b8', font: { family: 'Inter' } }
                }
            }
        }
    });

    // ==========================================
    // Gráfico de Categorias de Despesa (Mês Atual)
    // ==========================================
    const categorySpent = {};
    let totalSpentThisMonth = 0;

    state.transactions.forEach(t => {
        if (getMonthYearString(t.date) === currentMonthStr && t.type === 'despesa') {
            categorySpent[t.category] = (categorySpent[t.category] || 0) + t.amount;
            totalSpentThisMonth += t.amount;
        }
    });

    // Filtrar apenas categorias com gastos maiores que zero
    const activeCategories = Object.keys(categorySpent).filter(c => categorySpent[c] > 0);
    const categoryDataValues = activeCategories.map(c => categorySpent[c]);
    const categoryBgColors = activeCategories.map(c => CATEGORY_COLORS[c] || "hsl(215, 16%, 47%)");

    if (chartCategoriesInstance) {
        chartCategoriesInstance.destroy();
    }

    const ctxCat = document.getElementById('chartCategories').getContext('2d');
    chartCategoriesInstance = new Chart(ctxCat, {
        type: 'doughnut',
        data: {
            labels: activeCategories,
            datasets: [{
                data: categoryDataValues,
                backgroundColor: categoryBgColors,
                borderWidth: 2,
                borderColor: '#1e293b'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: { color: '#94a3b8', font: { family: 'Inter', size: 10 } }
                },
                title: {
                    display: true,
                    text: `Despesas por Categoria (Tot: ${formatCurrency(totalSpentThisMonth)})`,
                    color: '#f8fafc',
                    font: { family: 'Outfit', size: 14 }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const val = context.raw || 0;
                            const percentage = totalSpentThisMonth > 0 ? ((val / totalSpentThisMonth) * 100).toFixed(1) : 0;
                            return `${context.label}: ${formatCurrency(val)} (${percentage}%)`;
                        }
                    }
                }
            },
            cutout: '65%'
        }
    });
}

// ==========================================
// 3. GERENCIAMENTO DA PLANILHA (TABELA EDITÁVEL)
// ==========================================

function deleteTransaction(id) {
    state.transactions = state.transactions.filter(t => t.id !== id);
    saveState();
    renderDashboard();
    renderTable();
}

// Função para disparar a edição inline de uma célula
function makeCellEditable(td, transactionId, field) {
    if (td.querySelector('input') || td.querySelector('select')) return; // Já está em edição
    
    const transaction = state.transactions.find(t => t.id === transactionId);
    if (!transaction) return;

    const originalValue = transaction[field];
    let inputElement;

    // Criar o input adequado dependendo do campo
    if (field === 'date') {
        inputElement = document.createElement('input');
        inputElement.type = 'date';
        inputElement.value = originalValue;
    } else if (field === 'amount') {
        inputElement = document.createElement('input');
        inputElement.type = 'number';
        inputElement.step = '0.01';
        inputElement.value = originalValue;
    } else if (field === 'category') {
        inputElement = document.createElement('select');
        CATEGORIES.forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat;
            opt.text = cat;
            if (cat === originalValue) opt.selected = true;
            inputElement.appendChild(opt);
        });
    } else if (field === 'type') {
        inputElement = document.createElement('select');
        const optReceita = document.createElement('option');
        optReceita.value = 'receita';
        optReceita.text = 'Receita';
        if (originalValue === 'receita') optReceita.selected = true;
        
        const optDespesa = document.createElement('option');
        optDespesa.value = 'despesa';
        optDespesa.text = 'Despesa';
        if (originalValue === 'despesa') optDespesa.selected = true;
        
        inputElement.appendChild(optReceita);
        inputElement.appendChild(optDespesa);
    } else if (field === 'status') {
        inputElement = document.createElement('select');
        const optPago = document.createElement('option');
        optPago.value = 'pago';
        optPago.text = 'Pago';
        if (originalValue === 'pago') optPago.selected = true;
        
        const optPendente = document.createElement('option');
        optPendente.value = 'pendente';
        optPendente.text = 'Pendente';
        if (originalValue === 'pendente') optPendente.selected = true;
        
        inputElement.appendChild(optPago);
        inputElement.appendChild(optPendente);
    } else {
        // Descrição e Conta (text)
        inputElement = document.createElement('input');
        inputElement.type = 'text';
        inputElement.value = originalValue;
    }

    // Salvar ao perder o foco ou pressionar Enter
    function saveChange() {
        let newValue = inputElement.value;
        
        // Tratar tipos específicos
        if (field === 'amount') {
            newValue = parseFloat(newValue) || 0;
        }

        // Se for descrição, aplicar categorização automática opcional
        if (field === 'description') {
            const autoCat = checkAutoCategory(newValue);
            if (autoCat && transaction.category !== autoCat) {
                transaction.category = autoCat;
            }
        }

        // Salvar se mudou
        if (newValue !== originalValue) {
            transaction[field] = newValue;
            saveState();
            renderDashboard();
        }
        
        renderTable(); // Re-renderizar a tabela para exibir dados formatados
    }

    inputElement.addEventListener('blur', saveChange);
    inputElement.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            inputElement.blur(); // Salva no blur
        }
        if (e.key === 'Escape') {
            // Cancelar edição: restaura a tabela original sem salvar
            renderTable();
        }
    });

    td.innerHTML = '';
    td.appendChild(inputElement);
    inputElement.focus();
    if (inputElement.select) inputElement.select(); // Selecionar conteúdo se aplicável
}

// Renderiza a tabela de lançamentos principais
function renderTable() {
    const listBody = document.getElementById('transactionList');
    listBody.innerHTML = '';

    // Pegar critérios de filtragem
    const query = document.getElementById('searchTransactions').value.toLowerCase();
    const filterCat = document.getElementById('filterCategory').value;
    const filterType = document.getElementById('filterType').value;
    const filterStat = document.getElementById('filterStatus').value;

    // Filtrar dados
    let filtered = state.transactions.filter(t => {
        const matchesSearch = t.description.toLowerCase().includes(query) || t.account.toLowerCase().includes(query);
        const matchesCategory = filterCat === "" || t.category === filterCat;
        const matchesType = filterType === "" || t.type === filterType;
        const matchesStatus = filterStat === "" || t.status === filterStat;

        return matchesSearch && matchesCategory && matchesType && matchesStatus;
    });

    // Ordenar dados
    filtered.sort((a, b) => {
        let fieldA = a[state.sortField];
        let fieldB = b[state.sortField];

        // Normalizar tipos
        if (state.sortField === 'amount') {
            fieldA = parseFloat(fieldA);
            fieldB = parseFloat(fieldB);
        } else if (state.sortField === 'date') {
            fieldA = new Date(fieldA);
            fieldB = new Date(fieldB);
        } else {
            fieldA = String(fieldA).toLowerCase();
            fieldB = String(fieldB).toLowerCase();
        }

        if (fieldA < fieldB) return state.sortAsc ? -1 : 1;
        if (fieldA > fieldB) return state.sortAsc ? 1 : -1;
        return 0;
    });

    // Mostrar contador
    document.getElementById('tableCount').innerText = `Exibindo ${filtered.length} lançamento${filtered.length !== 1 ? 's' : ''}`;

    if (filtered.length === 0) {
        listBody.innerHTML = `
            <tr>
                <td colspan="8">
                    <div class="empty-state">
                        <div class="empty-state-icon">📭</div>
                        <p>Nenhum lançamento encontrado com os filtros selecionados.</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    filtered.forEach(t => {
        const tr = document.createElement('tr');
        
        // Verificar se ultrapassou o orçamento da categoria desta transação para dar destaque visual sutil
        const categoryBudget = state.budgets[t.category];
        let isOverBudgetClass = '';
        if (t.type === 'despesa' && categoryBudget) {
            // Calcular gastos do mês da transação nessa categoria
            const tMonth = getMonthYearString(t.date);
            const totalCategorySpent = state.transactions
                .filter(x => x.category === t.category && x.type === 'despesa' && getMonthYearString(x.date) === tMonth)
                .reduce((acc, curr) => acc + curr.amount, 0);

            if (totalCategorySpent > categoryBudget) {
                isOverBudgetClass = 'style="color: var(--accent-red); font-weight: 500"';
            }
        }

        tr.innerHTML = `
            <td>
                <button class="btn-icon-del delete-tx-btn" data-id="${t.id}" title="Excluir Lançamento">🗑️</button>
            </td>
            <td class="editable-cell" data-id="${t.id}" data-field="date">${t.date}</td>
            <td class="editable-cell" data-id="${t.id}" data-field="description">${t.description}</td>
            <td class="editable-cell" data-id="${t.id}" data-field="category" ${isOverBudgetClass}>${t.category}</td>
            <td>
                <span class="cell-type ${t.type} editable-cell" data-id="${t.id}" data-field="type">
                    ${t.type === 'receita' ? 'Receita' : 'Despesa'}
                </span>
            </td>
            <td class="cell-amount ${t.type} editable-cell" data-id="${t.id}" data-field="amount" style="text-align: right;">
                ${t.amount.toFixed(2)}
            </td>
            <td class="editable-cell" data-id="${t.id}" data-field="account">${t.account}</td>
            <td>
                <span class="cell-status ${t.status} editable-cell" data-id="${t.id}" data-field="status">
                    ${t.status === 'pago' ? 'Pago' : 'Pendente'}
                </span>
            </td>
        `;

        // Atribuir cliques de edição inline em cada célula da linha
        tr.querySelectorAll('.editable-cell').forEach(cell => {
            cell.addEventListener('dblclick', function() {
                const id = this.getAttribute('data-id');
                const field = this.getAttribute('data-field');
                makeCellEditable(this, id, field);
            });
        });

        listBody.appendChild(tr);
    });

    // Configurar botões de exclusão
    listBody.querySelectorAll('.delete-tx-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const id = this.getAttribute('data-id');
            if (confirm("Deseja realmente excluir este lançamento?")) {
                deleteTransaction(id);
            }
        });
    });
}

// Inserir uma linha vazia rápida e focar no input dela
function insertQuickRow() {
    const newId = `t-${Date.now()}`;
    const newTx = {
        id: newId,
        date: getTodayString(),
        description: "Novo Lançamento",
        category: "Outros",
        type: "despesa",
        amount: 0.00,
        account: "Carteira",
        status: "pendente"
    };

    state.transactions.unshift(newTx); // Inserir no topo para ficar visível
    saveState();
    renderDashboard();
    renderTable();

    // Encontrar a célula de descrição da nova linha criada para focar nela instantaneamente
    setTimeout(() => {
        const firstRowCells = document.querySelector(`#transactionList tr td[data-field="description"]`);
        if (firstRowCells) {
            makeCellEditable(firstRowCells, newId, 'description');
        }
    }, 50);
}

// ==========================================
// 4. AUTOMACÕES & REGRAS PANEL (TABS)
// ==========================================

function deleteRecurring(id) {
    state.recurring = state.recurring.filter(r => r.id !== id);
    saveState();
    renderRecurringList();
    renderDashboard();
}

function renderRecurringList() {
    const container = document.getElementById('listRecurring');
    container.innerHTML = '';
    
    if (state.recurring.length === 0) {
        container.innerHTML = `<span style="font-size:0.8rem; color:var(--text-muted)">Nenhum agendamento ativo.</span>`;
        return;
    }

    state.recurring.forEach(rec => {
        const item = document.createElement('div');
        item.className = 'panel-list-item';
        item.innerHTML = `
            <div class="item-info">
                <span class="item-title">${rec.description}</span>
                <span class="item-subtitle">Dia ${rec.day} • ${rec.category} • Conta: ${rec.account}</span>
            </div>
            <div class="item-action-group">
                <span class="item-value ${rec.type}">${rec.type === 'receita' ? '+' : '-'}${formatCurrency(rec.amount)}</span>
                <button class="btn-icon-del delete-rec-btn" data-id="${rec.id}">🗑️</button>
            </div>
        `;
        container.appendChild(item);
    });

    container.querySelectorAll('.delete-rec-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const id = this.getAttribute('data-id');
            if (confirm("Excluir este agendamento recorrente?")) {
                deleteRecurring(id);
            }
        });
    });
}

function deleteBudget(category) {
    delete state.budgets[category];
    saveState();
    renderBudgetsList();
    renderDashboard();
    renderTable(); // Re-renderizar para ajustar cores da categoria se mudou
}

function renderBudgetsList() {
    const container = document.getElementById('listBudgets');
    container.innerHTML = '';
    
    // Obter gastos do mês atual agrupados
    const currentMonthStr = getCurrentMonthString();
    const currentSpent = {};
    CATEGORIES.forEach(c => currentSpent[c] = 0);
    
    state.transactions.forEach(t => {
        if (getMonthYearString(t.date) === currentMonthStr && t.type === 'despesa') {
            currentSpent[t.category] = (currentSpent[t.category] || 0) + t.amount;
        }
    });

    const activeBudgets = Object.keys(state.budgets);
    if (activeBudgets.length === 0) {
        container.innerHTML = `<span style="font-size:0.8rem; color:var(--text-muted)">Nenhum limite de orçamento configurado.</span>`;
        return;
    }

    activeBudgets.forEach(cat => {
        const limit = state.budgets[cat];
        const spent = currentSpent[cat] || 0;
        const percent = Math.min((spent / limit) * 100, 100);
        
        let barColor = "var(--accent-green)";
        if (percent >= 90) barColor = "var(--accent-red)";
        else if (percent >= 75) barColor = "var(--accent-amber)";

        const item = document.createElement('div');
        item.className = 'panel-list-item';
        item.style.flexDirection = 'column';
        item.style.alignItems = 'stretch';
        item.style.gap = '0.5rem';

        item.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                <div class="item-info">
                    <span class="item-title">${cat}</span>
                    <span class="item-subtitle">Gasto: ${formatCurrency(spent)} de ${formatCurrency(limit)}</span>
                </div>
                <div class="item-action-group">
                    <span class="item-value" style="color: ${spent > limit ? 'var(--accent-red)' : 'var(--text-main)'}">
                        ${percent.toFixed(0)}%
                    </span>
                    <button class="btn-icon-del delete-budget-btn" data-category="${cat}">🗑️</button>
                </div>
            </div>
            <div class="budget-progress-container">
                <div class="budget-progress-bar">
                    <div class="budget-progress-fill" style="width: ${percent}%; background-color: ${barColor}"></div>
                </div>
            </div>
        `;
        container.appendChild(item);
    });

    container.querySelectorAll('.delete-budget-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const cat = this.getAttribute('data-category');
            if (confirm(`Remover o limite de gastos para a categoria "${cat}"?`)) {
                deleteBudget(cat);
            }
        });
    });
}

function deleteRule(keyword) {
    state.rules = state.rules.filter(r => r.keyword !== keyword);
    saveState();
    renderRulesList();
}

function renderRulesList() {
    const container = document.getElementById('listRules');
    container.innerHTML = '';

    if (state.rules.length === 0) {
        container.innerHTML = `<span style="font-size:0.8rem; color:var(--text-muted)">Nenhuma regra configurada.</span>`;
        return;
    }

    state.rules.forEach(rule => {
        const item = document.createElement('div');
        item.className = 'panel-list-item';
        item.innerHTML = `
            <div class="item-info">
                <span class="item-title">"${rule.keyword}"</span>
                <span class="item-subtitle">Direciona para: <strong>${rule.category}</strong></span>
            </div>
            <div class="item-action-group">
                <button class="btn-icon-del delete-rule-btn" data-keyword="${rule.keyword}">🗑️</button>
            </div>
        `;
        container.appendChild(item);
    });

    container.querySelectorAll('.delete-rule-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const kw = this.getAttribute('data-keyword');
            if (confirm(`Remover regra para a palavra-chave "${kw}"?`)) {
                deleteRule(kw);
            }
        });
    });
}

// Roda a renderização geral do Dashboard
function renderDashboard() {
    updateKpiCards();
    updateCharts();
    renderRecurringList();
    renderBudgetsList();
    renderRulesList();
}

// Popula os selects com as categorias existentes
function populateDropdownCategories() {
    const selects = ['filterCategory', 'txCategory', 'recCategory', 'bdCategory', 'rlCategory'];
    selects.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        
        // Preservar primeira opção (ex: "Todas as categorias") se for o filtro
        const firstOpt = id === 'filterCategory' ? el.firstElementChild : null;
        
        el.innerHTML = '';
        if (firstOpt) el.appendChild(firstOpt);

        CATEGORIES.forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat;
            opt.text = cat;
            el.appendChild(opt);
        });
    });
}

// ==========================================
// ==========================================
// 5. IMPORTACAO, EXPORTACAO E COMPARTILHAMENTO
// ==========================================

function downloadFile(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

function exportToCsv() {
    let csvContent = "Data,Descricao,Categoria,Tipo,Valor,Conta,Status\n";

    state.transactions.forEach(t => {
        const desc = t.description.replace(/,/g, ';');
        const acc = t.account.replace(/,/g, ';');
        const row = `${t.date},${desc},${t.category},${t.type},${t.amount.toFixed(2)},${acc},${t.status}`;
        csvContent += row + "\n";
    });

    downloadFile(csvContent, `GR_Controle_Export_${getTodayString()}.csv`, 'text/csv;charset=utf-8');
}

function exportToJson() {
    const backup = {
        version: 1,
        exportedAt: new Date().toISOString(),
        data: state
    };
    const jsonContent = JSON.stringify(backup, null, 2);
    downloadFile(jsonContent, `GR_Controle_Backup_${getTodayString()}.json`, 'application/json;charset=utf-8');
}

function importFromFile(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(evt) {
        const text = evt.target.result;
        const extension = file.name.split('.').pop().toLowerCase();

        if (extension === 'json') {
            try {
                const backup = JSON.parse(text);
                if (backup && backup.data && Array.isArray(backup.data.transactions)) {
                    if (confirm("Importar backup JSON e substituir os dados atuais?")) {
                        state = backup.data;
                        saveState();
                        renderDashboard();
                        renderTable();
                        alert('Backup JSON importado com sucesso!');
                    }
                } else {
                    throw new Error('Formato JSON incompatível');
                }
            } catch (err) {
                console.error(err);
                alert('Falha ao importar arquivo JSON. Verifique se o arquivo é um backup gerado por este app.');
            }
        } else if (extension === 'csv') {
            const lines = text.split("\n");
            let addedCount = 0;

            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (line === "") continue;

                const cols = line.split(",");
                if (cols.length >= 7) {
                    const date = cols[0];
                    const description = cols[1].replace(/;/g, ',');
                    const category = cols[2];
                    const type = cols[3];
                    const amount = parseFloat(cols[4]) || 0;
                    const account = cols[5].replace(/;/g, ',');
                    const status = cols[6];

                    if (date && description && CATEGORIES.includes(category) && (type === 'receita' || type === 'despesa') && (status === 'pago' || status === 'pendente')) {
                        state.transactions.unshift({
                            id: `t-csv-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 5)}`,
                            date,
                            description,
                            category,
                            type,
                            amount,
                            account,
                            status
                        });
                        addedCount++;
                    }
                }
            }

            if (addedCount > 0) {
                saveState();
                renderDashboard();
                renderTable();
                alert(`Sucesso! Importados ${addedCount} lançamentos.`);
            } else {
                alert("Formato de arquivo CSV inválido ou sem dados compatíveis. Certifique-se de que exportou no formato correto deste app.");
            }
        } else {
            alert('Formato de arquivo não suportado. Use .csv ou .json.');
        }

        e.target.value = ''; // Permite importar novamente o mesmo arquivo se necessário
    };
    reader.readAsText(file);
}

// Verifica se há dados de compartilhamento na URL (hash)
function checkUrlImport() {
    const hash = window.location.hash;
    if (hash && hash.startsWith('#data=')) {
        try {
            const compressedData = hash.substring(6);
            
            // Tenta descomprimir usando LZString (URL curto)
            let jsonString = LZString.decompressFromEncodedURIComponent(compressedData);
            
            // Fallback para Base64 puro antigo caso usem um link antigo
            if (!jsonString) {
                try {
                    jsonString = decodeURIComponent(escape(window.atob(compressedData)));
                } catch (b64Error) {
                    throw new Error("Falha ao descompactar dados do URL");
                }
            }
            
            const importedState = JSON.parse(jsonString);
            
            if (importedState && Array.isArray(importedState.transactions)) {
                if (confirm("Recebemos dados compartilhados do GR_Controle. Deseja IMPORTAR e SUBSTITUIR todos os seus lançamentos e configurações atuais pelos dados recebidos?")) {
                    state = importedState;
                    saveState();
                    window.history.replaceState(null, null, ' ');
                    alert("Dados importados com sucesso!");
                } else {
                    window.history.replaceState(null, null, ' ');
                }
            }
        } catch (e) {
            console.error("Erro ao decodificar dados compartilhados via link:", e);
            alert("Não foi possível carregar os dados do link. O link pode estar incompleto ou corrompido.");
            window.history.replaceState(null, null, ' ');
        }
    }
}

// Gera um link de compartilhamento compacto e abre o modal com QR Code
function generateShareLink() {
    try {
        const jsonString = JSON.stringify(state);
        
        // Compacta os dados com LZString para a URL ficar o menor possível
        const compressedData = LZString.compressToEncodedURIComponent(jsonString);
        
        // Remove hashes antigos para construir a URL
        const baseUrl = window.location.href.split('#')[0];
        const shareUrl = `${baseUrl}#data=${compressedData}`;
        
        // Preencher o input do modal
        const shareInput = document.getElementById('shareLinkInput');
        shareInput.value = shareUrl;
        
        // Renderizar o QR Code no canvas usando QRious
        const canvas = document.getElementById('qrCodeCanvas');
        new QRious({
            element: canvas,
            value: shareUrl,
            size: 200,
            background: 'white',
            foreground: '#0f172a',
            level: 'L'
        });

        // Abrir o Modal de Compartilhamento
        document.getElementById('modalShare').classList.add('active');

        // Configurar clique de cópia no modal
        const btnCopy = document.getElementById('btnCopyShareLink');
        btnCopy.onclick = function() {
            navigator.clipboard.writeText(shareUrl).then(() => {
                btnCopy.innerText = "Copiado!";
                btnCopy.style.background = "var(--accent-green)";
                setTimeout(() => {
                    btnCopy.innerText = "Copiar";
                    btnCopy.style.background = ""; // Reseta para padrão
                }, 2000);
            }).catch(err => {
                console.error("Erro ao copiar link:", err);
                shareInput.select();
                document.execCommand('copy');
                btnCopy.innerText = "Copiado!";
                setTimeout(() => { btnCopy.innerText = "Copiar"; }, 2000);
            });
        };

    } catch (e) {
        console.error("Erro ao gerar link de compartilhamento:", e);
        alert("Erro ao empacotar os dados de compartilhamento.");
    }
}

// ==========================================
// 6. EVENT LISTENERS E INICIALIZACÃO
// ==========================================

document.addEventListener("DOMContentLoaded", () => {
    // Carregar Estado
    loadState();
    
    // Verificar se há dados compartilhados via URL hash
    checkUrlImport();
    
    // Auto-carregar transações recorrentes do mês
    checkAndApplyRecurring();
    
    // Popular categorias nos seletores
    populateDropdownCategories();
    
    // Renders iniciais
    renderDashboard();
    renderTable();

    // Eventos de Abas (Panel lateral)
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

            this.classList.add('active');
            const tabId = this.getAttribute('data-tab');
            document.getElementById(tabId).classList.add('active');
        });
    });

    // Modais - Controle de abertura/fechamento
    function openModal(modalId) {
        document.getElementById(modalId).classList.add('active');
    }
    
    function closeModal(modalId) {
        document.getElementById(modalId).classList.remove('active');
    }

    document.querySelectorAll('.closeModalBtn').forEach(btn => {
        btn.addEventListener('click', function() {
            const modal = this.closest('.modal-backdrop');
            if (modal) modal.classList.remove('active');
        });
    });

    // Abrir Modal de Novo Lançamento
    document.getElementById('btnNewTransaction').addEventListener('click', () => {
        document.getElementById('txDate').value = getTodayString();
        document.getElementById('formTransaction').reset();
        document.getElementById('txDate').value = getTodayString(); // Reset limpa data, repor
        openModal('modalTransaction');
    });

    // Submit Novo Lançamento
    document.getElementById('formTransaction').addEventListener('submit', (e) => {
        e.preventDefault();
        const desc = document.getElementById('txDescription').value;
        const autoCat = checkAutoCategory(desc);
        const cat = autoCat || document.getElementById('txCategory').value;
        
        const trans = {
            id: `t-${Date.now()}`,
            date: document.getElementById('txDate').value,
            description: desc,
            category: cat,
            type: document.getElementById('txType').value,
            amount: parseFloat(document.getElementById('txAmount').value) || 0,
            account: document.getElementById('txAccount').value,
            status: document.getElementById('txStatus').value
        };

        state.transactions.unshift(trans);
        saveState();
        closeModal('modalTransaction');
        renderDashboard();
        renderTable();
    });

    // Abrir Modal de Novo Agendamento Recorrente
    document.getElementById('btnAddRecurring').addEventListener('click', () => {
        document.getElementById('formRecurring').reset();
        openModal('modalRecurring');
    });

    // Submit Novo Agendamento Recorrente
    document.getElementById('formRecurring').addEventListener('submit', (e) => {
        e.preventDefault();
        const rec = {
            id: `r-${Date.now()}`,
            day: parseInt(document.getElementById('recDay').value, 10),
            description: document.getElementById('recDescription').value,
            category: document.getElementById('recCategory').value,
            type: document.getElementById('recType').value,
            amount: parseFloat(document.getElementById('recAmount').value) || 0,
            account: document.getElementById('recAccount').value
        };

        state.recurring.push(rec);
        saveState();
        closeModal('modalRecurring');
        renderRecurringList();
        renderDashboard(); // Atualiza contagens se necessário
    });

    // Abrir Modal de Novo Limite de Orçamento
    document.getElementById('btnAddBudget').addEventListener('click', () => {
        document.getElementById('formBudget').reset();
        openModal('modalBudget');
    });

    // Submit Novo Limite de Orçamento
    document.getElementById('formBudget').addEventListener('submit', (e) => {
        e.preventDefault();
        const cat = document.getElementById('bdCategory').value;
        const limit = parseFloat(document.getElementById('bdLimit').value) || 0;

        state.budgets[cat] = limit;
        saveState();
        closeModal('modalBudget');
        renderBudgetsList();
        renderDashboard();
        renderTable(); // Re-renderiza a tabela principal para reajustar possíveis destaques
    });

    // Abrir Modal de Nova Regra Inteligente
    document.getElementById('btnAddRule').addEventListener('click', () => {
        document.getElementById('formRule').reset();
        openModal('modalRule');
    });

    // Submit Nova Regra Inteligente
    document.getElementById('formRule').addEventListener('submit', (e) => {
        e.preventDefault();
        const keyword = document.getElementById('rlKeyword').value.trim();
        const category = document.getElementById('rlCategory').value;

        // Evitar palavras duplicadas
        state.rules = state.rules.filter(r => r.keyword.toLowerCase() !== keyword.toLowerCase());
        
        state.rules.push({
            keyword: keyword,
            category: category
        });

        saveState();
        closeModal('modalRule');
        renderRulesList();
    });

    // Filtros e Pesquisa
    document.getElementById('searchTransactions').addEventListener('input', renderTable);
    document.getElementById('filterCategory').addEventListener('change', renderTable);
    document.getElementById('filterType').addEventListener('change', renderTable);
    document.getElementById('filterStatus').addEventListener('change', renderTable);

    document.getElementById('btnClearFilters').addEventListener('click', () => {
        document.getElementById('searchTransactions').value = '';
        document.getElementById('filterCategory').value = '';
        document.getElementById('filterType').value = '';
        document.getElementById('filterStatus').value = '';
        renderTable();
    });

    // Inserir Linha Rápida
    document.getElementById('btnAddRow').addEventListener('click', insertQuickRow);

    // Configurar Ordenação nas colunas da tabela
    document.querySelectorAll('.sheet-table th.sortable').forEach(th => {
        th.addEventListener('click', function() {
            const field = this.getAttribute('data-sort');
            if (state.sortField === field) {
                state.sortAsc = !state.sortAsc; // Inverte
            } else {
                state.sortField = field;
                state.sortAsc = true; // Reseta para ascendente
            }
            renderTable();
        });
    });

    // Ações do Cabeçalho: CSV/JSON, Compartilhamento e Reset
    document.getElementById('btnShareLink').addEventListener('click', generateShareLink);
    document.getElementById('btnExportCsv').addEventListener('click', exportToCsv);
    document.getElementById('btnExportJson').addEventListener('click', exportToJson);

    document.getElementById('btnImportCsv').addEventListener('click', () => {
        document.getElementById('csvFileInput').click();
    });
    document.getElementById('csvFileInput').addEventListener('change', importFromFile);

    document.getElementById('btnResetData').addEventListener('click', () => {
        if (confirm("Isso apagará todos os dados atuais e reiniciará com as configurações e transações de demonstração. Continuar?")) {
            localStorage.removeItem(LOCAL_STORAGE_KEY);
            loadState();
            checkAndApplyRecurring();
            renderDashboard();
            renderTable();
        }
    });
});
