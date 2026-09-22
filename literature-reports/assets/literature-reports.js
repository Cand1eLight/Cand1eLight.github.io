(function () {
  'use strict';

  var catalogue = document.querySelector('.literature-catalogue');
  if (!catalogue) return;

  var rows = Array.prototype.slice.call(catalogue.querySelectorAll('.report-list__item'));
  var search = document.getElementById('report-search');
  var clear = document.getElementById('report-clear');
  var reset = document.getElementById('knowledge-network-reset');
  var status = document.getElementById('report-filter-status');
  var visibleCount = catalogue.querySelector('[data-visible-count]');
  var emptyState = document.getElementById('report-no-results');
  var activeTopic = '';
  var graph;

  function scrollToCatalogue() {
    var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    catalogue.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  }

  function update() {
    var query = search ? search.value.trim().toLocaleLowerCase() : '';
    var visibleRows = [];

    rows.forEach(function (row) {
      var topics = (row.getAttribute('data-topics') || '').split('|').filter(Boolean);
      var text = (row.getAttribute('data-search') || '').toLocaleLowerCase();
      var matches = (!activeTopic || topics.indexOf(activeTopic) !== -1) && (!query || text.indexOf(query) !== -1);

      row.hidden = !matches;
      if (matches) visibleRows.push(row);
    });

    if (visibleCount) visibleCount.textContent = String(visibleRows.length);
    if (status) {
      var filters = [];
      if (activeTopic) filters.push('主题：' + activeTopic);
      if (query) filters.push('搜索：' + query);
      status.textContent = (filters.length ? filters.join(' · ') + ' · ' : '') + '显示 ' + visibleRows.length + ' / ' + rows.length + ' 篇';
    }
    if (emptyState) emptyState.hidden = visibleRows.length !== 0;
    if (graph) graph.setActiveTopic(activeTopic);
  }

  function clearFilters() {
    activeTopic = '';
    if (search) search.value = '';
    update();
  }

  graph = createKnowledgeGraph({
    onTopic: function (topic) {
      activeTopic = activeTopic === topic ? '' : topic;
      update();
      scrollToCatalogue();
    },
    onReport: function (href) {
      window.location.assign(href);
    }
  });

  if (search) search.addEventListener('input', update);

  if (clear) {
    clear.addEventListener('click', function () {
      clearFilters();
      if (search) search.focus();
    });
  }

  if (reset) {
    reset.addEventListener('click', function () {
      clearFilters();
      if (graph) graph.reset();
    });
  }

  update();

  function createKnowledgeGraph(handlers) {
    var canvas = document.getElementById('knowledge-network-canvas');
    var dataElement = document.getElementById('knowledge-network-data');
    var tooltip = document.getElementById('knowledge-network-tooltip');
    var readout = document.querySelector('.knowledge-network__readout');
    if (!canvas || !dataElement || !window.HTMLCanvasElement) return null;

    var data;
    try {
      data = JSON.parse(dataElement.textContent || '{}');
    } catch (error) {
      return null;
    }

    var context = canvas.getContext('2d');
    if (!context) return null;

    var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var palette = [
      { node: '#a45742', dim: '#6d392c', edge: 'rgba(141, 73, 54, .4)', halo: 'rgba(164, 87, 66, .16)' },
      { node: '#707a68', dim: '#4f5849', edge: 'rgba(93, 106, 84, .38)', halo: 'rgba(112, 122, 104, .15)' },
      { node: '#91715b', dim: '#6d5343', edge: 'rgba(133, 99, 73, .36)', halo: 'rgba(145, 113, 91, .14)' },
      { node: '#6a8188', dim: '#4a5f66', edge: 'rgba(91, 119, 128, .35)', halo: 'rgba(106, 129, 136, .14)' }
    ];
    var nodes = [];
    var nodeById = {};
    var topicByLabel = {};
    var edges = [];
    var clusters = [];
    var hovered = null;
    var active = '';
    var width = 1;
    var height = 1;
    var worldWidth = 1;
    var worldHeight = 1;
    var pixelRatio = 1;
    var animationFrame;
    var simulationFrames = 0;
    var previousTime = 0;
    var clickSuppressed = false;
    var pointer = { active: false, x: 0, y: 0 };
    var view = { scale: 1, offsetX: 0, offsetY: 0, panning: false, moved: false, lastX: 0, lastY: 0 };

    (data.topics || []).forEach(function (topic, index) {
      var node = {
        id: topic.id,
        kind: 'topic',
        label: topic.label,
        count: topic.count || 1,
        degree: 0,
        radius: 5,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        phase: index * 0.83,
        neighbours: []
      };
      nodes.push(node);
      nodeById[node.id] = node;
      topicByLabel[node.label] = node;
    });

    (data.reports || []).forEach(function (report, index) {
      var node = {
        id: report.id,
        kind: 'report',
        label: report.label,
        title: report.title,
        href: report.href,
        topics: report.topics || [],
        degree: 0,
        radius: 5,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        phase: index * 0.71 + 1.2,
        neighbours: []
      };
      nodes.push(node);
      nodeById[node.id] = node;
    });

    (data.reports || []).forEach(function (report) {
      var reportNode = nodeById[report.id];
      (report.topics || []).forEach(function (topic) {
        var topicNode = topicByLabel[topic];
        if (!reportNode || !topicNode) return;
        edges.push({
          source: reportNode,
          target: topicNode,
          topic: topic,
          bend: (random(edges.length + 1, 8) - 0.5) * 26,
          // 每条关系各有自然长度，二部图不会被迫收敛成等距的横竖网格。
          restLength: 50 + random(edges.length + 1, 11) * 48
        });
        reportNode.neighbours.push(topicNode);
        topicNode.neighbours.push(reportNode);
      });
    });

    // 论文之间的直接关联来自共享主题。它既符合阅读脉络，也能避免纯二部图
    // 在少量节点时形成“主题一排、论文一排”的表格式骨架。
    (data.reports || []).forEach(function (report, index) {
      var source = nodeById[report.id];
      (data.reports || []).slice(index + 1).forEach(function (candidate) {
        var target = nodeById[candidate.id];
        var sharedTopics = (report.topics || []).filter(function (topic) {
          return (candidate.topics || []).indexOf(topic) !== -1;
        });
        if (!source || !target || !sharedTopics.length) return;

        edges.push({
          source: source,
          target: target,
          topic: sharedTopics[0],
          kind: 'shared-topic',
          bend: (random(edges.length + 1, 14) - 0.5) * 18,
          restLength: 42 + random(edges.length + 1, 15) * 24
        });
        source.neighbours.push(target);
        target.neighbours.push(source);
      });
    });

    function random(index, salt) {
      var value = Math.sin((index + 1) * 9283 + salt * 719) * 10000;
      return value - Math.floor(value);
    }

    function buildClusters() {
      var visited = {};
      clusters = [];

      nodes.forEach(function (start) {
        if (visited[start.id]) return;
        var queue = [start];
        var members = [];
        visited[start.id] = true;
        while (queue.length) {
          var node = queue.shift();
          members.push(node);
          node.neighbours.forEach(function (neighbour) {
            if (visited[neighbour.id]) return;
            visited[neighbour.id] = true;
            queue.push(neighbour);
          });
        }
        var reports = members.filter(function (node) { return node.kind === 'report'; });
        var topics = members.filter(function (node) { return node.kind === 'topic'; });
        clusters.push({
          nodes: members,
          reports: reports,
          topics: topics,
          weight: Math.max(1, reports.length * 1.7 + topics.length),
          radius: 0,
          anchorX: 0,
          anchorY: 0
        });
      });

      clusters.sort(function (left, right) {
        return right.weight - left.weight || right.nodes.length - left.nodes.length;
      });

      clusters.forEach(function (cluster, index) {
        cluster.index = index;
        cluster.colour = palette[index % palette.length];
        cluster.radius = 30 + Math.min(70, Math.sqrt(cluster.weight) * 17);
        cluster.nodes.forEach(function (node) {
          node.cluster = cluster;
          node.degree = node.neighbours.length;
          node.relatedReports = 0;
          if (node.kind === 'report') {
            var related = {};
            node.neighbours.forEach(function (topic) {
              topic.neighbours.forEach(function (candidate) {
                if (candidate.kind === 'report' && candidate !== node) related[candidate.id] = true;
              });
            });
            node.relatedReports = Object.keys(related).length;
          }
          node.radius = node.kind === 'topic'
            ? 5 + Math.min(9, Math.pow(Math.max(1, node.degree), 0.78) * 2.9)
            : 4.8 + Math.min(7.5, node.degree * 0.65 + node.relatedReports * 1.2);
        });
      });

      if (readout) {
        var spans = readout.querySelectorAll('span');
        if (spans[1]) spans[1].textContent = clusters.length + ' DIRECTIONS';
      }
    }

    function placeClusterAnchors() {
      var centerX = worldWidth * 0.51;
      var centerY = worldHeight * 0.55;
      var padding = graphPadding();
      if (clusters.length === 1) {
        clusters[0].anchorX = centerX;
        clusters[0].anchorY = centerY;
        clusters[0].layoutAngle = -Math.PI / 2;
        return;
      }

      var totalWeight = clusters.reduce(function (sum, cluster) { return sum + cluster.weight; }, 0);
      var cursor = -Math.PI * 0.82;
      var largestCluster = clusters.reduce(function (largest, cluster) { return Math.max(largest, cluster.radius); }, 0);
      var radiusX = Math.max(0, Math.min(
        worldWidth * 0.19,
        worldWidth / 2 - padding.horizontal - largestCluster * 0.65
      ));
      var radiusY = Math.max(0, Math.min(
        worldHeight * 0.14,
        (worldHeight - padding.top - padding.bottom) / 2 - largestCluster * 0.42
      ));
      clusters.forEach(function (cluster) {
        var span = Math.PI * 2 * (cluster.weight / totalWeight);
        var angle = cursor + span / 2;
        cursor += span;
        cluster.anchorX = centerX + Math.cos(angle) * radiusX;
        cluster.anchorY = centerY + Math.sin(angle) * radiusY;
        cluster.layoutAngle = Math.atan2(cluster.anchorY - centerY, cluster.anchorX - centerX);
      });
    }

    function placeNodes() {
      placeClusterAnchors();
      var padding = graphPadding();
      clusters.forEach(function (cluster) {
        // 不再使用“中心节点 + 放射枝”的图谱。每个方向是一条弯曲的神经脊线，
        // 论文和主题在脊线两侧错位生长，关系靠连线呈现而非靠一个视觉中心统治。
        var ordered = cluster.nodes.slice().sort(function (left, right) {
          var kindOrder = left.kind === right.kind ? 0 : (left.kind === 'report' ? -1 : 1);
          return right.degree - left.degree || kindOrder || left.label.localeCompare(right.label);
        });
        var axisX = Math.cos(cluster.layoutAngle);
        var axisY = Math.sin(cluster.layoutAngle);
        var normalX = -axisY;
        var normalY = axisX;
        var span = Math.min(185, 68 + ordered.length * 17);
        cluster.hub = null;

        function placeNode(node, x, y, side, seed) {
          node.x = x;
          node.y = y;
          containInEnvelope(node, padding, 0.88);
          node.restX = node.x;
          node.restY = node.y;
          node.flowAxisX = axisX;
          node.flowAxisY = axisY;
          node.flowNormalX = normalX;
          node.flowNormalY = normalY;
          node.flowSide = side;
          node.flowSeed = seed;
          node.openX = node.restX + normalX * side * 20;
          node.openY = node.restY + normalY * side * 20;
          node.vx = 0;
          node.vy = 0;
        }

        ordered.forEach(function (node, index) {
          var seed = index + cluster.index * 31;
          var ratio = ordered.length === 1 ? 0.5 : index / (ordered.length - 1);
          var along = (ratio - 0.5) * span;
          var weave = Math.sin(ratio * Math.PI * (1.45 + random(seed, 3) * 0.55) + random(seed, 4) * Math.PI) * (13 + random(seed, 5) * 15);
          var side = ((index + cluster.index) % 2 ? 1 : -1);
          var branch = side * (16 + random(seed, 6) * 27) * (0.45 + Math.sin(ratio * Math.PI) * 0.55);
          var axialJitter = (random(seed, 7) - 0.5) * 18;
          placeNode(
            node,
            cluster.anchorX + axisX * (along + axialJitter) + normalX * (weave + branch),
            cluster.anchorY + axisY * (along + axialJitter) + normalY * (weave + branch),
            side,
            seed
          );
        });
      });
    }

    function resize() {
      var bounds = canvas.getBoundingClientRect();
      width = Math.max(1, bounds.width);
      height = Math.max(1, bounds.height);
      setWorldBounds();
      pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      placeNodes();
      fitView();
      draw();
    }

    function setWorldBounds() {
      // 为枝状布局留出呼吸空间；视图会自动缩放以完整呈现。
      var density = Math.max(1.22, Math.sqrt(Math.max(1, nodes.length) / 12));
      worldWidth = Math.max(width, width * density);
      worldHeight = Math.max(height, height * density);
    }

    function graphPadding() {
      return {
        horizontal: Math.max(34, Math.min(56, worldWidth * 0.12)),
        top: Math.max(60, Math.min(76, worldHeight * 0.2)),
        bottom: Math.max(34, Math.min(52, worldHeight * 0.13))
      };
    }

    function graphEnvelope(padding) {
      var left = padding.horizontal;
      var right = worldWidth - padding.horizontal;
      var top = padding.top;
      var bottom = worldHeight - padding.bottom;
      return {
        x: (left + right) / 2,
        y: (top + bottom) / 2,
        radiusX: (right - left) / 2,
        radiusY: (bottom - top) / 2
      };
    }

    function containInEnvelope(node, padding, limit) {
      var envelope = graphEnvelope(padding);
      var dx = node.x - envelope.x;
      var dy = node.y - envelope.y;
      var normalizedDistance = Math.sqrt(
        (dx * dx) / (envelope.radiusX * envelope.radiusX) +
        (dy * dy) / (envelope.radiusY * envelope.radiusY)
      );
      if (normalizedDistance <= 1) return;

      var correction = (limit || 0.978) / normalizedDistance;
      node.x = envelope.x + dx * correction;
      node.y = envelope.y + dy * correction;
      // 沿椭圆的无形轮廓减速，而不是在四条直线边界上反弹。
      node.vx *= 0.72;
      node.vy *= 0.72;
    }

    function containTargetInEnvelope(node, padding, limit) {
      var envelope = graphEnvelope(padding);
      var dx = node.targetX - envelope.x;
      var dy = node.targetY - envelope.y;
      var normalizedDistance = Math.sqrt(
        (dx * dx) / (envelope.radiusX * envelope.radiusX) +
        (dy * dy) / (envelope.radiusY * envelope.radiusY)
      );
      if (normalizedDistance <= limit) return;
      var correction = limit / normalizedDistance;
      node.targetX = envelope.x + dx * correction;
      node.targetY = envelope.y + dy * correction;
    }

    function resolveTargetCollisions() {
      var padding = graphPadding();
      var gutter = Math.max(12, 10 / view.scale);

      // 固定顺序的少量迭代，类似游戏中稳定的圆形碰撞盒分离；
      // 只作用于目标位置，不会向节点注入随机速度。
      for (var pass = 0; pass < 4; pass += 1) {
        for (var index = 0; index < nodes.length; index += 1) {
          for (var otherIndex = index + 1; otherIndex < nodes.length; otherIndex += 1) {
            var left = nodes[index];
            var right = nodes[otherIndex];
            var dx = right.targetX - left.targetX;
            var dy = right.targetY - left.targetY;
            var distance = Math.sqrt(dx * dx + dy * dy);
            var minimumDistance = markerRadius(left) + markerRadius(right) + gutter;

            if (distance >= minimumDistance) continue;
            if (distance < 0.001) {
              var fallbackAngle = (index * 0.71 + otherIndex * 1.17) % (Math.PI * 2);
              dx = Math.cos(fallbackAngle);
              dy = Math.sin(fallbackAngle);
              distance = 1;
            }

            var overlap = (minimumDistance - distance) * 0.56;
            var leftFreedom = left === left.cluster.hub ? 0.25 : 1;
            var rightFreedom = right === right.cluster.hub ? 0.25 : 1;
            var freedomTotal = leftFreedom + rightFreedom;
            var unitX = dx / distance;
            var unitY = dy / distance;

            left.targetX -= unitX * overlap * (leftFreedom / freedomTotal);
            left.targetY -= unitY * overlap * (leftFreedom / freedomTotal);
            right.targetX += unitX * overlap * (rightFreedom / freedomTotal);
            right.targetY += unitY * overlap * (rightFreedom / freedomTotal);
            containTargetInEnvelope(left, padding, 0.9);
            containTargetInEnvelope(right, padding, 0.9);
          }
        }
      }
    }

    function minimumScale() {
      return Math.max(0.28, Math.min(0.62, Math.min(width / worldWidth, height / worldHeight) * 0.72));
    }

    function fitView() {
      view.scale = Math.min(0.82, (width - 72) / worldWidth, (height - 28) / worldHeight);
      view.offsetX = (width - worldWidth * view.scale) / 2;
      view.offsetY = (height - worldHeight * view.scale) / 2;
    }

    function screenToWorld(x, y) {
      return {
        x: (x - view.offsetX) / view.scale,
        y: (y - view.offsetY) / view.scale
      };
    }

    function isRelated(left, right) {
      if (!left || !right) return false;
      if (left === right) return true;
      return left.neighbours.indexOf(right) !== -1;
    }

    function isActiveNode(node) {
      return !!active && ((node.kind === 'topic' && node.label === active) || (node.kind === 'report' && node.topics.indexOf(active) !== -1));
    }

    function markerRadius(node) {
      return node.radius;
    }

    function step(frameTime) {
      var delta = Math.min(2, Math.max(0.35, (frameTime - previousTime) / 16.67 || 1));
      previousTime = frameTime;
      var influenceRadius = Math.max(92, Math.min(228, Math.min(worldWidth, worldHeight) * 0.52, 156 / view.scale));
      var easing = 1 - Math.pow(0.88, delta);
      nodes.forEach(function (node) {
        // 沿神经脊线和侧枝各自流动：没有中心旋转，也没有随机力。
        var spineFlow = Math.sin(frameTime * 0.00024 + node.phase * 1.31) * 18;
        var branchFlow = Math.sin(frameTime * 0.00031 + node.phase * 2.07 + node.flowSide * 0.6) * 15;
        var sharedFlow = Math.sin(frameTime * 0.00018 + node.cluster.index * 1.71) * 8;
        var targetX = node.restX +
          node.flowAxisX * spineFlow +
          node.flowNormalX * (branchFlow + sharedFlow);
        var targetY = node.restY +
          node.flowAxisY * spineFlow +
          node.flowNormalY * (branchFlow + sharedFlow);

        if (pointer.active && !view.panning) {
          // 指针只增添少量张力；图谱本身始终会缓慢流动。
          targetX += ((node.openX || node.restX) - node.restX) * 0.16;
          targetY += ((node.openY || node.restY) - node.restY) * 0.16;
          var pointerDx = node.restX - pointer.x;
          var pointerDy = node.restY - pointer.y;
          var pointerDistance = Math.max(1, Math.sqrt(pointerDx * pointerDx + pointerDy * pointerDy));
          if (pointerDistance < influenceRadius) {
            var pressure = (influenceRadius - pointerDistance) / influenceRadius;
            // 局部再施加很小的导向，保留“鼠标引导”的感觉而不产生抖动。
            var offset = pressure * pressure * 7;
            targetX += pointerDx / pointerDistance * offset;
            targetY += pointerDy / pointerDistance * offset;
            var envelope = graphEnvelope(graphPadding());
            var envelopeDx = targetX - envelope.x;
            var envelopeDy = targetY - envelope.y;
            var envelopeDistance = Math.sqrt(
              (envelopeDx * envelopeDx) / (envelope.radiusX * envelope.radiusX) +
              (envelopeDy * envelopeDy) / (envelope.radiusY * envelope.radiusY)
            );
            if (envelopeDistance > 0.965) {
              var correction = 0.965 / envelopeDistance;
              targetX = envelope.x + envelopeDx * correction;
              targetY = envelope.y + envelopeDy * correction;
            }
          }
        }

        node.targetX = targetX;
        node.targetY = targetY;
      });

      resolveTargetCollisions();
      nodes.forEach(function (node) {
        // 只向一个连续、确定的目标插值；没有随机力或弹簧反弹。
        node.x += (node.targetX - node.x) * easing;
        node.y += (node.targetY - node.y) * easing;
      });
    }

    function drawLabel(node, related) {
      var showAll = width >= 500 && nodes.length <= 18 && view.scale <= 1.22;
      if (!showAll && node !== hovered && !related && !isActiveNode(node)) return;
      context.save();
      context.font = (node.kind === 'topic' ? '500 10.5px "Segoe UI", "Microsoft YaHei", sans-serif' : '10.5px "Segoe UI", "Microsoft YaHei", sans-serif');
      context.textBaseline = 'middle';
      var label = node.label;
      var maxWidth = Math.min(155, worldWidth * 0.25);
      while (context.measureText(label).width > maxWidth && label.length > 4) label = label.slice(0, -2) + '…';
      var leftSide = node.x > worldWidth * 0.61;
      var textX = node.x + (leftSide ? -markerRadius(node) - 7 : markerRadius(node) + 7);
      context.textAlign = leftSide ? 'right' : 'left';
      var labelWidth = context.measureText(label).width;
      var labelX = leftSide ? textX - labelWidth - 3 : textX - 3;
      context.fillStyle = 'rgba(248, 246, 240, .86)';
      context.fillRect(labelX, node.y - 8, labelWidth + 6, 16);
      context.fillStyle = related || isActiveNode(node) ? '#232822' : (node.kind === 'topic' ? 'rgba(63, 69, 61, .92)' : 'rgba(51, 55, 49, .88)');
      context.fillText(label, textX, node.y);
      context.restore();
    }

    function drawPointerField() {
      if (!pointer.active || view.panning || reducedMotion) return;
      context.save();
      var radius = Math.max(34 / view.scale, Math.min(72 / view.scale, Math.min(worldWidth, worldHeight) * 0.23));
      var gradient = context.createRadialGradient(pointer.x, pointer.y, 0, pointer.x, pointer.y, radius);
      gradient.addColorStop(0, 'rgba(141, 73, 54, .1)');
      gradient.addColorStop(0.64, 'rgba(141, 73, 54, .022)');
      gradient.addColorStop(1, 'rgba(141, 73, 54, 0)');
      context.fillStyle = gradient;
      context.beginPath();
      context.arc(pointer.x, pointer.y, radius, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = 'rgba(141, 73, 54, .15)';
      context.lineWidth = 0.65;
      context.beginPath();
      context.arc(pointer.x, pointer.y, radius * 0.64, 0, Math.PI * 2);
      context.stroke();
      context.restore();
    }

    function drawTopicMarker(node, colour, emphasized) {
      context.save();
      context.beginPath();
      context.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
      context.fillStyle = emphasized ? colour.halo : 'rgba(248, 246, 240, .78)';
      context.strokeStyle = emphasized ? '#332d28' : colour.node;
      context.lineWidth = emphasized ? 1.5 : 1.08;
      context.fill();
      context.stroke();
      context.restore();
    }

    function draw() {
      context.clearRect(0, 0, width, height);
      context.save();
      context.translate(view.offsetX, view.offsetY);
      context.scale(view.scale, view.scale);

      edges.forEach(function (edge) {
        var edgeActive = active && edge.topic === active;
        var hoverRelated = hovered && (edge.source === hovered || edge.target === hovered);
        context.beginPath();
        context.moveTo(edge.source.x, edge.source.y);
        var edgeDx = edge.target.x - edge.source.x;
        var edgeDy = edge.target.y - edge.source.y;
        var edgeLength = Math.max(1, Math.sqrt(edgeDx * edgeDx + edgeDy * edgeDy));
        context.quadraticCurveTo(
          (edge.source.x + edge.target.x) / 2 - edgeDy / edgeLength * edge.bend,
          (edge.source.y + edge.target.y) / 2 + edgeDx / edgeLength * edge.bend,
          edge.target.x,
          edge.target.y
        );
        context.strokeStyle = edgeActive || hoverRelated
          ? 'rgba(78, 55, 44, .78)'
          : (edge.kind === 'shared-topic' ? 'rgba(66, 72, 63, .32)' : edge.source.cluster.colour.edge);
        context.lineWidth = edgeActive || hoverRelated ? 1.2 : (edge.kind === 'shared-topic' ? 0.9 : 0.68);
        context.stroke();
      });

      nodes.forEach(function (node) {
        var related = !!hovered && isRelated(node, hovered);
        var emphasized = node === hovered || related || isActiveNode(node);
        var colour = node.cluster.colour;
        context.save();
        if (emphasized) {
          context.shadowColor = colour.node;
          context.shadowBlur = node === hovered ? 12 : 6;
        }
        if (node.kind === 'topic') {
          drawTopicMarker(node, colour, emphasized);
        } else {
          // 大节点保持原来的实心圆标记。
          context.beginPath();
          context.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
          context.fillStyle = emphasized ? '#fffaf3' : colour.node;
          context.strokeStyle = emphasized ? '#332d28' : colour.dim;
          context.lineWidth = 0.8;
          context.fill();
          context.stroke();
        }
        context.restore();
        drawLabel(node, related);
      });

      drawPointerField();
      context.restore();
    }

    function animate(time) {
      step(time);
      draw();
      animationFrame = undefined;
      simulationFrames -= 1;
      if (!reducedMotion && !document.hidden) animationFrame = window.requestAnimationFrame(animate);
    }

    function wakeGraph(frames) {
      if (reducedMotion) {
        draw();
        return;
      }
      simulationFrames = Math.max(simulationFrames, frames || 1);
      if (!animationFrame && !document.hidden) {
        previousTime = performance.now();
        animationFrame = window.requestAnimationFrame(animate);
      }
    }

    function findNode(x, y) {
      var nearest = null;
      var nearestDistance = Infinity;
      nodes.forEach(function (node) {
        var dx = node.x - x;
        var dy = node.y - y;
        var distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < markerRadius(node) + 10 && distance < nearestDistance) {
          nearest = node;
          nearestDistance = distance;
        }
      });
      return nearest;
    }

    function positionTooltip(node, clientX, clientY) {
      if (!tooltip) return;
      if (!node) {
        tooltip.hidden = true;
        return;
      }
      tooltip.textContent = node.kind === 'report'
        ? node.title + ' · ' + node.relatedReports + ' 条主题交叉'
        : node.label + ' · ' + node.degree + ' 篇相关报告';
      tooltip.hidden = false;
      var frame = canvas.parentElement.getBoundingClientRect();
      var x = Math.max(12, Math.min(frame.width - 212, clientX - frame.left + 13));
      var y = Math.max(50, Math.min(frame.height - 44, clientY - frame.top + 13));
      tooltip.style.transform = 'translate(' + x + 'px, ' + y + 'px)';
    }

    function updatePointer(event) {
      var bounds = canvas.getBoundingClientRect();
      var world = screenToWorld(event.clientX - bounds.left, event.clientY - bounds.top);
      pointer.x = world.x;
      pointer.y = world.y;
      pointer.active = true;
      return world;
    }

    function updateHover(event, world) {
      var nextHovered = findNode(world.x, world.y);
      if (hovered !== nextHovered) {
        hovered = nextHovered;
        canvas.style.cursor = hovered ? 'pointer' : 'grab';
        draw();
      }
      positionTooltip(hovered, event.clientX, event.clientY);
    }

    canvas.addEventListener('pointermove', function (event) {
      if (view.panning) {
        var moveX = event.clientX - view.lastX;
        var moveY = event.clientY - view.lastY;
        if (Math.abs(moveX) + Math.abs(moveY) > 1) view.moved = true;
        view.offsetX += moveX;
        view.offsetY += moveY;
        view.lastX = event.clientX;
        view.lastY = event.clientY;
        canvas.style.cursor = 'grabbing';
        draw();
        return;
      }
      var world = updatePointer(event);
      updateHover(event, world);
      // 只在鼠标经过时短暂求解；闲置时画面完全静止。
      wakeGraph(18);
    });

    canvas.addEventListener('pointerdown', function (event) {
      var world = updatePointer(event);
      var node = findNode(world.x, world.y);
      if (node) return;
      view.panning = true;
      view.moved = false;
      view.lastX = event.clientX;
      view.lastY = event.clientY;
      pointer.active = false;
      canvas.setPointerCapture(event.pointerId);
      canvas.style.cursor = 'grabbing';
      if (tooltip) tooltip.hidden = true;
    });

    canvas.addEventListener('pointerup', function (event) {
      if (!view.panning) return;
      clickSuppressed = view.moved;
      view.panning = false;
      pointer.active = false;
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      canvas.style.cursor = hovered ? 'pointer' : 'grab';
      draw();
    });

    canvas.addEventListener('pointerleave', function () {
      if (view.panning) return;
      pointer.active = false;
      hovered = null;
      if (tooltip) tooltip.hidden = true;
      canvas.style.cursor = 'grab';
      draw();
      // 鼠标离开后留出一小段时间，让受扰节点平静回位。
      wakeGraph(54);
    });

    canvas.addEventListener('click', function () {
      if (clickSuppressed) {
        clickSuppressed = false;
        return;
      }
      if (!hovered) return;
      if (hovered.kind === 'topic') handlers.onTopic(hovered.label);
      if (hovered.kind === 'report' && hovered.href) handlers.onReport(hovered.href);
    });

    canvas.addEventListener('wheel', function (event) {
      event.preventDefault();
      var bounds = canvas.getBoundingClientRect();
      var screenX = event.clientX - bounds.left;
      var screenY = event.clientY - bounds.top;
      var before = screenToWorld(screenX, screenY);
      var nextScale = Math.max(minimumScale(), Math.min(2.8, view.scale * (event.deltaY < 0 ? 1.12 : 0.89)));
      view.scale = nextScale;
      view.offsetX = screenX - before.x * nextScale;
      view.offsetY = screenY - before.y * nextScale;
      draw();
    }, { passive: false });

    canvas.addEventListener('keydown', function (event) {
      var stepSize = event.shiftKey ? 34 : 16;
      var changed = true;
      if (event.key === '+' || event.key === '=') view.scale = Math.min(2.8, view.scale * 1.12);
      else if (event.key === '-') view.scale = Math.max(minimumScale(), view.scale * 0.89);
      else if (event.key === 'ArrowLeft') view.offsetX += stepSize;
      else if (event.key === 'ArrowRight') view.offsetX -= stepSize;
      else if (event.key === 'ArrowUp') view.offsetY += stepSize;
      else if (event.key === 'ArrowDown') view.offsetY -= stepSize;
      else if (event.key === 'Escape') {
        placeNodes();
        fitView();
      } else changed = false;
      if (changed) {
        event.preventDefault();
        draw();
      }
    });

    var observer = window.ResizeObserver ? new ResizeObserver(resize) : null;
    if (observer) observer.observe(canvas);
    else window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) return;
      draw();
      if (!reducedMotion && !animationFrame) animationFrame = window.requestAnimationFrame(animate);
    });

    buildClusters();
    resize();
    if (!reducedMotion) animationFrame = window.requestAnimationFrame(animate);

    return {
      setActiveTopic: function (topic) {
        active = topic || '';
        draw();
      },
      reset: function () {
        active = '';
        hovered = null;
        pointer.active = false;
        if (tooltip) tooltip.hidden = true;
        placeNodes();
        fitView();
        draw();
      }
    };
  }
}());
