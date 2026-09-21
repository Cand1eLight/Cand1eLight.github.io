(function () {
  'use strict';

  var catalogue = document.querySelector('.literature-catalogue');
  if (!catalogue) return;

  var rows = Array.prototype.slice.call(catalogue.querySelectorAll('.report-list__item'));
  var search = document.getElementById('report-search');
  var clear = document.getElementById('report-clear');
  var status = document.getElementById('report-filter-status');
  var visibleCount = catalogue.querySelector('[data-visible-count]');
  var emptyState = document.getElementById('report-no-results');
  var map = document.querySelector('.research-map');
  var topicLinks = map ? Array.prototype.slice.call(map.querySelectorAll('.research-map__topic')) : [];
  var edges = map ? Array.prototype.slice.call(map.querySelectorAll('.research-map__edge')) : [];
  var activeTopic = '';

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
    if (status) status.textContent = activeTopic
      ? '“' + activeTopic + '” · 显示 ' + visibleRows.length + ' / ' + rows.length + ' 篇'
      : '显示 ' + visibleRows.length + ' / ' + rows.length + ' 篇报告';
    if (emptyState) emptyState.hidden = visibleRows.length !== 0;

    topicLinks.forEach(function (link) {
      if (link.getAttribute('data-topic') === activeTopic) {
        link.setAttribute('aria-current', 'true');
      } else {
        link.removeAttribute('aria-current');
      }
    });

    edges.forEach(function (edge) {
      var topicMatches = !activeTopic || edge.getAttribute('data-topic') === activeTopic;
      var paperVisible = visibleRows.some(function (row) {
        return row.id === 'report-entry-' + edge.getAttribute('data-report-index');
      });
      edge.classList.toggle('is-muted', !topicMatches || !paperVisible);
    });
  }

  topicLinks.forEach(function (link) {
    link.addEventListener('click', function (event) {
      event.preventDefault();
      var topic = link.getAttribute('data-topic') || '';
      activeTopic = activeTopic === topic ? '' : topic;
      update();
      var target = document.getElementById('literature-catalogue');
      if (target) {
        var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
      }
    });

    function emphasize() {
      var topic = link.getAttribute('data-topic');
      edges.forEach(function (edge) {
        edge.classList.toggle('is-emphasized', edge.getAttribute('data-topic') === topic);
      });
    }

    function restore() {
      edges.forEach(function (edge) {
        edge.classList.remove('is-emphasized');
      });
    }

    link.addEventListener('mouseenter', emphasize);
    link.addEventListener('mouseleave', restore);
    link.addEventListener('focus', emphasize);
    link.addEventListener('blur', restore);
  });

  if (search) search.addEventListener('input', update);

  if (clear) {
    clear.addEventListener('click', function () {
      activeTopic = '';
      if (search) search.value = '';
      update();
      if (search) search.focus();
    });
  }

  update();
}());
