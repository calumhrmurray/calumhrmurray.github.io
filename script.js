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
  const width = Math.max(graphHost.clientWidth, 640);
  const height = Math.max(graphHost.clientHeight, 360);

  const svg = createSvg(width, height);
  graphHost.appendChild(svg);

  const nodeLookup = new Map();
  const nodes = graphData.nodes.map(node => {
    const seededNode = {
      ...node,
      x: randomBetween(48, width - 48),
      y: randomBetween(48, height - 48),
      vx: 0,
      vy: 0
    };
    nodeLookup.set(node.id, seededNode);
    return seededNode;
  });

  const links = graphData.links.map(link => ({
    source: nodeLookup.get(link.source),
    target: nodeLookup.get(link.target)
  }));

  runSimulation(nodes, links, width, height);

  const { linkElements, nodeElements } = drawGraph(svg, nodes, links);
  updatePositions(linkElements, nodeElements);

  enableDragging(svg, nodeElements, linkElements, width, height);
}

function createSvg(width, height) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('role', 'presentation');
  svg.setAttribute('focusable', 'false');
  return svg;
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function runSimulation(nodes, links, width, height) {
  const iterations = 280;
  const chargeStrength = 1400;
  const springLength = 120;
  const springStiffness = 0.015;
  const centerStrength = 0.006;
  const friction = 0.86;
  const margin = 28;

  for (let step = 0; step < iterations; step += 1) {
    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const a = nodes[i];
        const b = nodes[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const distance = Math.max(Math.hypot(dx, dy), 1);
        const force = chargeStrength / (distance * distance);
        const fx = (force * dx) / distance;
        const fy = (force * dy) / distance;
        a.vx += fx;
        a.vy += fy;
        b.vx -= fx;
        b.vy -= fy;
      }
    }

    links.forEach(link => {
      const dx = link.target.x - link.source.x;
      const dy = link.target.y - link.source.y;
      const distance = Math.max(Math.hypot(dx, dy), 1);
      const force = springStiffness * (distance - springLength);
      const fx = (force * dx) / distance;
      const fy = (force * dy) / distance;
      link.source.vx += fx;
      link.source.vy += fy;
      link.target.vx -= fx;
      link.target.vy -= fy;
    });

    nodes.forEach(node => {
      node.vx += (width / 2 - node.x) * centerStrength;
      node.vy += (height / 2 - node.y) * centerStrength;
      node.vx *= friction;
      node.vy *= friction;
      node.x = clamp(node.x + node.vx * 0.02, margin, width - margin);
      node.y = clamp(node.y + node.vy * 0.02, margin, height - margin);
    });
  }
}

function drawGraph(svg, nodes, links) {
  const linkGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  linkGroup.setAttribute('stroke', 'rgba(129, 161, 193, 0.35)');
  linkGroup.setAttribute('stroke-width', '1.4');
  svg.appendChild(linkGroup);

  const linkElements = links.map(link => {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.classList.add('graph-link');
    linkGroup.appendChild(line);
    return { line, data: link };
  });

  const nodeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  svg.appendChild(nodeGroup);

  const nodeElements = nodes.map(node => {
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.classList.add('graph-node');
    nodeGroup.appendChild(group);

    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('r', node.group === 'paper' ? '12' : '10');
    circle.setAttribute('fill', node.group === 'paper' ? '#81a1c1' : '#72b6aa');
    circle.setAttribute('stroke', '#f3f7fc');
    circle.setAttribute('stroke-width', node.group === 'paper' ? '1.6' : '1.2');
    circle.dataset.id = node.id;
    group.appendChild(circle);

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.textContent = node.id;
    text.setAttribute('x', '16');
    text.setAttribute('y', '4');
    text.setAttribute('fill', '#24303c');
    text.setAttribute('font-size', '12px');
    text.setAttribute('font-weight', '600');
    text.setAttribute('font-family', '"Palatino", "Palatino Linotype", "Book Antiqua", Georgia, serif');
    group.appendChild(text);

    const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
    title.textContent = node.id;
    group.appendChild(title);

    return { group, circle, text, data: node };
  });

  return { linkElements, nodeElements };
}

function updatePositions(linkElements, nodeElements) {
  linkElements.forEach(({ line, data }) => {
    line.setAttribute('x1', data.source.x.toFixed(1));
    line.setAttribute('y1', data.source.y.toFixed(1));
    line.setAttribute('x2', data.target.x.toFixed(1));
    line.setAttribute('y2', data.target.y.toFixed(1));
  });

  nodeElements.forEach(({ group, data }) => {
    group.setAttribute('transform', `translate(${data.x.toFixed(1)}, ${data.y.toFixed(1)})`);
  });
}

function enableDragging(svg, nodeElements, linkElements, width, height) {
  let activeNode = null;
  let pointerId = null;
  const margin = 28;

  const moveNode = event => {
    if (!activeNode || event.pointerId !== pointerId) return;
    const position = clientToSvg(svg, event.clientX, event.clientY);
    activeNode.x = clamp(position.x, margin, width - margin);
    activeNode.y = clamp(position.y, margin, height - margin);
    updatePositions(linkElements, nodeElements);
  };

  const endDrag = event => {
    if (event.pointerId !== pointerId) return;
    const circle = event.target;
    circle.classList.remove('is-dragging');
    circle.releasePointerCapture(pointerId);
    activeNode = null;
    pointerId = null;
  };

  nodeElements.forEach(({ circle, data }) => {
    circle.addEventListener('pointerdown', event => {
      event.preventDefault();
      activeNode = data;
      pointerId = event.pointerId;
      circle.classList.add('is-dragging');
      circle.setPointerCapture(pointerId);
    });

    circle.addEventListener('pointermove', moveNode);
    circle.addEventListener('pointerup', endDrag);
    circle.addEventListener('pointercancel', endDrag);
    circle.addEventListener('lostpointercapture', endDrag);
  });
}

function clientToSvg(svg, clientX, clientY) {
  const rect = svg.getBoundingClientRect();
  const scaleX = svg.viewBox.baseVal.width / rect.width;
  const scaleY = svg.viewBox.baseVal.height / rect.height;
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

// Photo toggling logic
const photo = document.getElementById('profile-photo');

function buildMonochromeVersion() {
  return new Promise((resolve, reject) => {
    if (!photo) {
      reject(new Error('Profile photo not found'));
      return;
    }

    const process = () => {
      const canvas = document.createElement('canvas');
      canvas.width = photo.naturalWidth;
      canvas.height = photo.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(photo, 0, 0);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const gray = 0.299 * r + 0.587 * g + 0.114 * b;
        data[i] = gray;
        data[i + 1] = gray;
        data[i + 2] = gray;
      }

      ctx.putImageData(imageData, 0, 0);
      const altSrc = canvas.toDataURL('image/png');
      resolve(altSrc);
    };

    if (photo.complete) {
      process();
    } else {
      photo.addEventListener('load', process, { once: true });
      photo.addEventListener('error', reject, { once: true });
    }
  });
}

if (photo) {
  const originalSrc = window.PROFILE_PHOTO_SRC || photo.getAttribute('src');
  if (originalSrc) {
    photo.src = originalSrc;
  }
  let monochromeSrc = null;

  const togglePhoto = async () => {
    try {
      if (!monochromeSrc) {
        monochromeSrc = await buildMonochromeVersion();
      }

      const useMonochrome = !photo.classList.contains('is-monochrome');
      photo.classList.toggle('is-monochrome', useMonochrome);
      photo.setAttribute('aria-pressed', useMonochrome);
      photo.src = useMonochrome ? monochromeSrc : originalSrc;
    } catch (err) {
      console.error('Could not build monochrome photo', err);
    }
  };

  photo.addEventListener('click', togglePhoto);
  photo.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      togglePhoto();
    }
  });
}
