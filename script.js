let data = {
  institutions: [],
  featureImportance: {},
  years: [],
  selectedYear: null,
  selectedModel: 'RandomForest',
  selectedOutcome: 'grad_rate',
  selectedSchool: null,
  filteredData: [],
  filters: {
    sector: ['Public', 'Private nonprofit', 'For-profit'],
    state: '',
    size: ['Small', 'Medium', 'Large']
  }
};

async function loadData() {
  try {
    const instResponse = await fetch('data/institutions.json');
    data.institutions = await instResponse.json();
    
    const importResponse = await fetch('data/feature_importance.json');
    data.featureImportance = await importResponse.json();
    
    data.years = [...new Set(data.institutions.map(d => d.year))].sort();
    data.selectedYear = data.years[data.years.length - 1];
    
    initializeUI();
    applyFilters();
    renderVisualizations();
  } catch (error) {
    console.error('Error loading data:', error);
  }
}

function initializeUI() {
  const yearSelect = document.getElementById('year-select');
  yearSelect.innerHTML = data.years.map(year => 
    `<option value="${year}" ${year === data.selectedYear ? 'selected' : ''}>${year}</option>`
  ).join('');
  
  yearSelect.addEventListener('change', (e) => {
    data.selectedYear = parseInt(e.target.value);
    applyFilters();
    renderVisualizations();
  });

  document.getElementById('model-select').addEventListener('change', (e) => {
    data.selectedModel = e.target.value;
    renderImportance();
    updateProfileComparison();
  });

  document.getElementById('outcome-toggle').addEventListener('change', (e) => {
    data.selectedOutcome = e.target.value;
    applyFilters();
    renderVisualizations();
  });

  const stateSelect = document.getElementById('state-select');
  const states = [...new Set(data.institutions.map(d => d.state))].sort();
  stateSelect.innerHTML = '<option value="">All States</option>' + 
    states.map(state => `<option value="${state}">${state}</option>`).join('');
  
  stateSelect.addEventListener('change', (e) => {
    data.filters.state = e.target.value;
    applyFilters();
    renderVisualizations();
  });

  document.querySelectorAll('input[name="sector"]').forEach(checkbox => {
    checkbox.addEventListener('change', updateSectorFilter);
  });

  document.querySelectorAll('input[name="size"]').forEach(checkbox => {
    checkbox.addEventListener('change', updateSizeFilter);
  });
}

function updateSectorFilter() {
  data.filters.sector = Array.from(document.querySelectorAll('input[name="sector"]:checked'))
    .map(cb => cb.value);
  applyFilters();
  renderVisualizations();
}

function updateSizeFilter() {
  data.filters.size = Array.from(document.querySelectorAll('input[name="size"]:checked'))
    .map(cb => cb.value);
  applyFilters();
  renderVisualizations();
}

function applyFilters() {
  data.filteredData = data.institutions.filter(d => {
    const yearMatch = d.year === data.selectedYear;
    const sectorMatch = data.filters.sector.includes(d.sector);
    const stateMatch = !data.filters.state || d.state === data.filters.state;
    const sizeMatch = data.filters.size.includes(d.school_size_category);
    
    return yearMatch && sectorMatch && stateMatch && sizeMatch;
  });
}

function renderVisualizations() {
  renderMap();
  renderImportance();
}

function renderMap() {
  const margin = { top: 20, right: 20, bottom: 20, left: 20 };
  const svgElement = document.getElementById('map-svg');
  const width = svgElement.parentElement.clientWidth - 40;
  const height = 500;
  
  svgElement.innerHTML = '';
  
  const svg = d3.select('#map-svg')
    .attr('width', width)
    .attr('height', height);
  
  const xScale = d3.scaleLinear().domain([-125, -66]).range([margin.left, width - margin.right]);
  const yScale = d3.scaleLinear().domain([24, 50]).range([height - margin.bottom, margin.top]);
  
  let colorScale;
  if (data.selectedOutcome === 'grad_rate') {
    const values = data.filteredData.map(d => d[`predicted_grad_rate_${data.selectedModel}`]);
    const minVal = d3.min(values);
    const maxVal = d3.max(values);
    colorScale = d3.scaleLinear()
      .domain([minVal, maxVal])
      .range(['#ffffcc', '#0051ba']);
  } else {
    colorScale = d3.scaleOrdinal()
      .domain(['Low', 'Medium', 'High'])
      .range(['#2ca02c', '#ff7f0e', '#d62728']);
  }
  
  const dots = svg.selectAll('.institution-dot')
    .data(data.filteredData, d => d.unitid + '_' + d.year)
    .join(
      enter => enter.append('circle')
        .attr('class', 'institution-dot')
        .attr('cx', d => xScale(d.longitude))
        .attr('cy', d => yScale(d.latitude))
        .attr('r', 4)
        .on('mouseover', (event, d) => showTooltip(event, d))
        .on('mouseout', hideTooltip)
        .on('click', (event, d) => selectSchool(d)),
      update => update,
      exit => exit.remove()
    );
  
  dots.attr('fill', d => {
    if (data.selectedOutcome === 'grad_rate') {
      return colorScale(d[`predicted_grad_rate_${data.selectedModel}`]);
    } else {
      return colorScale(d[`risk_category_${data.selectedModel}`]);
    }
  });
  
  svg.append('text')
    .attr('x', width / 2)
    .attr('y', height - 5)
    .attr('text-anchor', 'middle')
    .attr('class', 'axis-label')
    .text('Longitude');
  
  svg.append('text')
    .attr('transform', `translate(15, ${height / 2}) rotate(-90)`)
    .attr('text-anchor', 'middle')
    .attr('class', 'axis-label')
    .text('Latitude');
  
  const legend = svg.selectAll('.legend')
    .data(colorScale.domain().slice().reverse())
    .enter()
    .append('g')
    .attr('class', 'legend')
    .attr('transform', (d, i) => `translate(${width - 120}, ${margin.top + i * 20})`);
  
  legend.append('rect')
    .attr('width', 12)
    .attr('height', 12)
    .attr('fill', d => colorScale(d));
  
  legend.append('text')
    .attr('x', 18)
    .attr('y', 10)
    .attr('font-size', '11px')
    .text(d => d);
}

function renderImportance() {
  const margin = { top: 20, right: 20, bottom: 20, left: 150 };
  const svgElement = document.getElementById('importance-svg');
  const width = svgElement.parentElement.clientWidth - 40;
  const height = 500;
  
  svgElement.innerHTML = '';
  
  const svg = d3.select('#importance-svg')
    .attr('width', width)
    .attr('height', height);
  
  const importanceData = data.featureImportance[data.selectedYear]?.[data.selectedModel] || [];
  
  const yScale = d3.scaleBand()
    .domain(importanceData.map(d => d.feature_name))
    .range([height - margin.bottom, margin.top])
    .padding(0.3);
  
  const xScale = d3.scaleLinear()
    .domain([0, d3.max(importanceData, d => d.importance_value)])
    .range([margin.left, width - margin.right]);
  
  svg.selectAll('.bar')
    .data(importanceData)
    .enter()
    .append('rect')
    .attr('class', 'bar')
    .attr('y', d => yScale(d.feature_name))
    .attr('x', margin.left)
    .attr('height', yScale.bandwidth())
    .attr('width', d => xScale(d.importance_value) - margin.left)
    .attr('fill', '#0066cc');
  
  svg.append('g')
    .attr('transform', `translate(${margin.left}, 0)`)
    .call(d3.axisLeft(yScale))
    .style('font-size', '11px');
  
  svg.append('g')
    .attr('transform', `translate(0, ${height - margin.bottom})`)
    .call(d3.axisBottom(xScale))
    .style('font-size', '11px');
  
  svg.append('text')
    .attr('x', width / 2)
    .attr('y', height - 5)
    .attr('text-anchor', 'middle')
    .attr('class', 'axis-label')
    .text('Importance');
}

function showTooltip(event, school) {
  const tooltip = document.createElement('div');
  tooltip.className = 'tooltip';
  tooltip.style.display = 'block';
  tooltip.style.left = (event.pageX + 10) + 'px';
  tooltip.style.top = (event.pageY - 10) + 'px';
  
  const gradRate = data.selectedOutcome === 'grad_rate' 
    ? `Predicted: ${school[`predicted_grad_rate_${data.selectedModel}`].toFixed(1)}%`
    : `Predicted: ${school[`risk_category_${data.selectedModel}`]}`;
  
  tooltip.innerHTML = `
    <strong>${school.institution_name}</strong><br>
    State: ${school.state}<br>
    Actual Grad Rate: ${school.actual_grad_rate.toFixed(1)}%<br>
    ${gradRate}
  `;
  
  document.body.appendChild(tooltip);
}

function hideTooltip() {
  document.querySelectorAll('.tooltip').forEach(el => el.remove());
}

function selectSchool(school) {
  data.selectedSchool = school;
  showProfileSection();
  renderProfileCard();
  updateWhatIfPanel();
}

function showProfileSection() {
  document.getElementById('profile-section').style.display = 'block';
  document.getElementById('whatif-section').style.display = 'block';
}

function renderProfileCard() {
  if (!data.selectedSchool) return;
  
  const school = data.selectedSchool;
  document.getElementById('profile-name').textContent = school.institution_name;
  
  document.getElementById('profile-info').innerHTML = `
    <div class="profile-info-item"><strong>State:</strong> ${school.state}</div>
    <div class="profile-info-item"><strong>Sector:</strong> ${school.sector}</div>
    <div class="profile-info-item"><strong>Size:</strong> ${school.school_size_category}</div>
  `;
  
  renderComparison();
  renderTrend();
}

function renderComparison() {
  const school = data.selectedSchool;
  const margin = { top: 10, right: 20, bottom: 30, left: 40 };
  const svgElement = document.getElementById('comparison-svg');
  const width = svgElement.parentElement.clientWidth / 2 - 20;
  const height = 100;
  
  svgElement.innerHTML = '';
  
  const svg = d3.select('#comparison-svg')
    .attr('width', width * 2 + 20)
    .attr('height', height);
  
  let comparisonData;
  if (data.selectedOutcome === 'grad_rate') {
    comparisonData = [
      { label: 'Actual', value: school.actual_grad_rate },
      { label: 'Predicted', value: school[`predicted_grad_rate_${data.selectedModel}`] }
    ];
  } else {
    comparisonData = [
      { label: 'Actual', value: school.risk_category_linear ? (school.risk_category_linear === 'Low' ? 75 : school.risk_category_linear === 'Medium' ? 50 : 25) : 50 },
      { label: 'Predicted', value: school[`risk_category_${data.selectedModel}`] === 'Low' ? 75 : school[`risk_category_${data.selectedModel}`] === 'Medium' ? 50 : 25 }
    ];
  }
  
  const xScale = d3.scaleBand()
    .domain(comparisonData.map(d => d.label))
    .range([margin.left, width - margin.right])
    .padding(0.3);
  
  const yScale = d3.scaleLinear()
    .domain([0, 100])
    .range([height - margin.bottom, margin.top]);
  
  svg.selectAll('.bar')
    .data(comparisonData)
    .enter()
    .append('rect')
    .attr('class', 'bar')
    .attr('x', d => xScale(d.label))
    .attr('y', d => yScale(d.value))
    .attr('width', xScale.bandwidth())
    .attr('height', d => height - margin.bottom - yScale(d.value));
  
  svg.append('g')
    .attr('transform', `translate(0, ${height - margin.bottom})`)
    .call(d3.axisBottom(xScale))
    .style('font-size', '11px');
  
  svg.append('g')
    .attr('transform', `translate(${margin.left}, 0)`)
    .call(d3.axisLeft(yScale))
    .style('font-size', '11px');
}

function renderTrend() {
  const schoolHistory = data.institutions.filter(d => d.unitid === data.selectedSchool.unitid);
  
  const margin = { top: 10, right: 20, bottom: 30, left: 40 };
  const svgElement = document.getElementById('trend-svg');
  const width = svgElement.parentElement.clientWidth / 2 - 20;
  const height = 80;
  
  svgElement.innerHTML = '';
  
  const svg = d3.select('#trend-svg')
    .attr('width', width * 2 + 20)
    .attr('height', height);
  
  const xScale = d3.scaleLinear()
    .domain(d3.extent(schoolHistory, d => d.year))
    .range([margin.left, width - margin.right]);
  
  const yScale = d3.scaleLinear()
    .domain([0, 100])
    .range([height - margin.bottom, margin.top]);
  
  const line = d3.line()
    .x(d => xScale(d.year))
    .y(d => yScale(d.actual_grad_rate));
  
  svg.append('path')
    .datum(schoolHistory)
    .attr('fill', 'none')
    .attr('stroke', '#0066cc')
    .attr('stroke-width', 1.5)
    .attr('d', line);
  
  svg.selectAll('.dot')
    .data(schoolHistory)
    .enter()
    .append('circle')
    .attr('cx', d => xScale(d.year))
    .attr('cy', d => yScale(d.actual_grad_rate))
    .attr('r', 2)
    .attr('fill', '#0066cc');
  
  svg.append('g')
    .attr('transform', `translate(0, ${height - margin.bottom})`)
    .call(d3.axisBottom(xScale).tickFormat(d3.format('d')))
    .style('font-size', '10px');
  
  svg.append('g')
    .attr('transform', `translate(${margin.left}, 0)`)
    .call(d3.axisLeft(yScale))
    .style('font-size', '10px');
}

function updateWhatIfPanel() {
  const school = data.selectedSchool;
  const whatifContent = document.getElementById('whatif-content');
  
  whatifContent.innerHTML = `
    <div class="slider-group">
      <label>Pell %: <span class="slider-value" id="pell-val">${school.pell_percentage.toFixed(1)}%</span></label>
      <input type="range" id="pell-slider" min="0" max="100" step="0.1" value="${school.pell_percentage}">
    </div>
    <div class="slider-group">
      <label>Admission Rate: <span class="slider-value" id="admission-val">${(school.admission_rate * 100).toFixed(1)}%</span></label>
      <input type="range" id="admission-slider" min="0" max="1" step="0.01" value="${school.admission_rate}">
    </div>
    <div class="slider-group">
      <label>Retention Rate: <span class="slider-value" id="retention-val">${(school.retention_rate * 100).toFixed(1)}%</span></label>
      <input type="range" id="retention-slider" min="0" max="1" step="0.01" value="${school.retention_rate}">
    </div>
    <div class="slider-group">
      <label>Student-Faculty Ratio: <span class="slider-value" id="ratio-val">${school.student_faculty_ratio.toFixed(1)}</span></label>
      <input type="range" id="ratio-slider" min="5" max="40" step="0.1" value="${school.student_faculty_ratio}">
    </div>
    <div class="slider-group">
      <label>Spending per Student: <span class="slider-value" id="spend-val">$${school.spending_per_student.toFixed(0)}</span></label>
      <input type="range" id="spend-slider" min="5000" max="30000" step="500" value="${school.spending_per_student}">
    </div>
    <button class="reset-button" id="reset-button">Reset Scenario</button>
  `;
  
  const sliders = [
    { id: 'pell-slider', label: 'pell-val', format: v => v.toFixed(1) + '%' },
    { id: 'admission-slider', label: 'admission-val', format: v => (v * 100).toFixed(1) + '%' },
    { id: 'retention-slider', label: 'retention-val', format: v => (v * 100).toFixed(1) + '%' },
    { id: 'ratio-slider', label: 'ratio-val', format: v => v.toFixed(1) },
    { id: 'spend-slider', label: 'spend-val', format: v => '$' + v.toFixed(0) }
  ];
  
  sliders.forEach(s => {
    const slider = document.getElementById(s.id);
    const label = document.getElementById(s.label);
    slider.addEventListener('input', () => {
      label.textContent = s.format(parseFloat(slider.value));
      updateProfileComparison();
    });
  });
  
  document.getElementById('reset-button').addEventListener('click', () => {
    document.getElementById('pell-slider').value = school.pell_percentage;
    document.getElementById('admission-slider').value = school.admission_rate;
    document.getElementById('retention-slider').value = school.retention_rate;
    document.getElementById('ratio-slider').value = school.student_faculty_ratio;
    document.getElementById('spend-slider').value = school.spending_per_student;
    
    sliders.forEach(s => {
      const slider = document.getElementById(s.id);
      document.getElementById(s.label).textContent = s.format(parseFloat(slider.value));
    });
    
    updateProfileComparison();
  });
}

function updateProfileComparison() {
  if (!data.selectedSchool) return;
  renderComparison();
}

loadData();
