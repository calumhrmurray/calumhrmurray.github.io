const graphData = {
  nodes: [
    { id: 'Galaxy Clusters', group: 'theme' },
    { id: 'Weak Lensing', group: 'theme' },
    { id: 'Mass Estimation', group: 'theme' },
    { id: 'Noise Filtering', group: 'paper' },
    { id: 'Cluster Abundance', group: 'theme' },
    { id: 'Super-sample Covariance', group: 'theme' },
    { id: 'Likelihood Design', group: 'theme' },
    { id: 'Simulation-based Inference', group: 'theme' },
    { id: 'Intrinsic Alignments', group: 'theme' },
    { id: 'Reconstruction', group: 'theme' },
    { id: 'Cross-correlations', group: 'theme' },
    { id: 'CMB Lensing', group: 'theme' },
    { id: 'Moving Lenses', group: 'paper' },
    { id: 'Modified Gravity (f(R))', group: 'paper' },
    { id: 'Radio Dipole', group: 'paper' },
    { id: 'Euclid Q1', group: 'paper' },
    { id: 'Halo Mass Function', group: 'paper' },
    { id: 'SBI Likelihood', group: 'paper' },
    { id: 'LSST/Euclid Era', group: 'theme' }
  ],
  links: [
    { source: 'Galaxy Clusters', target: 'Weak Lensing' },
    { source: 'Galaxy Clusters', target: 'Cluster Abundance' },
    { source: 'Galaxy Clusters', target: 'Euclid Q1' },
    { source: 'Weak Lensing', target: 'Mass Estimation' },
    { source: 'Mass Estimation', target: 'Noise Filtering' },
    { source: 'Mass Estimation', target: 'Halo Mass Function' },
    { source: 'Halo Mass Function', target: 'Cluster Abundance' },
    { source: 'Cluster Abundance', target: 'Super-sample Covariance' },
    { source: 'Cluster Abundance', target: 'Likelihood Design' },
    { source: 'Likelihood Design', target: 'Simulation-based Inference' },
    { source: 'Likelihood Design', target: 'SBI Likelihood' },
    { source: 'Simulation-based Inference', target: 'LSST/Euclid Era' },
    { source: 'Weak Lensing', target: 'Intrinsic Alignments' },
    { source: 'Intrinsic Alignments', target: 'Reconstruction' },
    { source: 'Reconstruction', target: 'Cross-correlations' },
    { source: 'Cross-correlations', target: 'CMB Lensing' },
    { source: 'Cross-correlations', target: 'Moving Lenses' },
    { source: 'CMB Lensing', target: 'Modified Gravity (f(R))' },
    { source: 'Cross-correlations', target: 'Radio Dipole' },
    { source: 'LSST/Euclid Era', target: 'Euclid Q1' },
    { source: 'LSST/Euclid Era', target: 'Weak Lensing' }
  ]
};

const graphHost = document.getElementById('graph');
if (graphHost) {
  const width = graphHost.clientWidth;
  const height = graphHost.clientHeight;

  const svg = d3.select('#graph').append('svg')
    .attr('width', width)
    .attr('height', height);

  const color = d3.scaleOrdinal()
    .domain(['paper', 'theme'])
    .range(['#81a1c1', '#72b6aa']);

  const simulation = d3.forceSimulation(graphData.nodes)
    .force('link', d3.forceLink(graphData.links).id(d => d.id).distance(110).strength(0.9))
    .force('charge', d3.forceManyBody().strength(-260))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collision', d3.forceCollide().radius(45));

  const link = svg.append('g')
    .attr('stroke', 'rgba(129, 161, 193, 0.35)')
    .attr('stroke-width', 1.4)
    .selectAll('line')
    .data(graphData.links)
    .join('line');

  const node = svg.append('g')
    .selectAll('g')
    .data(graphData.nodes)
    .join('g')
    .call(drag(simulation));

  node.append('circle')
    .attr('r', d => d.group === 'paper' ? 12 : 10)
    .attr('fill', d => color(d.group))
    .attr('stroke', '#f3f7fc')
    .attr('stroke-width', d => d.group === 'paper' ? 1.6 : 1.2)
    .attr('filter', 'drop-shadow(0 8px 18px rgba(47,52,64,0.16))');

  node.append('text')
    .text(d => d.id)
    .attr('x', 16)
    .attr('y', 4)
    .attr('fill', '#24303c')
    .style('font-size', '12px')
    .style('font-weight', '600')
    .style('font-family', '"Palatino", "Palatino Linotype", "Book Antiqua", Georgia, serif');

  node.append('title').text(d => d.id);

  simulation.on('tick', () => {
    link
      .attr('x1', d => d.source.x)
      .attr('y1', d => d.source.y)
      .attr('x2', d => d.target.x)
      .attr('y2', d => d.target.y);

    node
      .attr('transform', d => `translate(${d.x},${d.y})`);
  });
}

function drag(simulation) {
  function dragstarted(event, d) {
    if (!event.active) simulation.alphaTarget(0.2).restart();
    d.fx = d.x;
    d.fy = d.y;
  }

  function dragged(event, d) {
    d.fx = event.x;
    d.fy = event.y;
  }

  function dragended(event, d) {
    if (!event.active) simulation.alphaTarget(0);
    d.fx = null;
    d.fy = null;
  }

  return d3.drag()
    .on('start', dragstarted)
    .on('drag', dragged)
    .on('end', dragended);
}
