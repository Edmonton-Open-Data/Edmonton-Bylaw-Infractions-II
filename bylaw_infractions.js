document.addEventListener("DOMContentLoaded", function dashboard() {
    //Set up loading spinner
     var opts = {
         lines: 13,
         length: 22,
         width: 9,
         radius: 30,
         corners: 1,
         rotate: 2,
         direction: 1,
         speed: 1,
         trail: 60,
         shadow: false,
         hwaccel: false,
         className: 'spinner',
         zIndex: 2e9,
         top:'17%',
         left: '50%'
     };
   
     var target = document.getElementById("spinner");
     var spinner = new Spinner(opts).spin(target);
     queue()
            .defer(d3.json, "https://raw.githubusercontent.com/Edmonton-Open-Data/Edmonton-Bylaw-Infractions-II/master/data/Edmonton2.json") //neighbourhoodsGejson
            .defer(d3.json, "https://raw.githubusercontent.com/Edmonton-Open-Data/Edmonton-Bylaw-Infractions-II/master/data/data.json")     //datajson
            .await(renderCharts);
  
     function renderCharts(error, neighbourhoodsGejson, dataJson) {
 
         if(error) throw error;
         
         //cleaned data
         var data  = dataJson.data;
 
         //Crossfilter instance
         var ndx = crossfilter(data);
 
         //Define values to be used by chart(s)
         var chartHeightScale = 0.58,
             pieXscale        = 1.41,
             pieRscale        = chartHeightScale * 0.5,
             pieInnerRscale   = pieRscale * 0.52,
             monthNames       = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
             countSum         = data.map(function(d) { return d.COUNT; })
                                    .reduce(function(sum, value) { return sum + value; }, 0 ),
             map, info, mapReset, title, texts, chartTexts, slideMenu;
 
         //Colors and color scales
         //Got the colors from http://colorbrewer2.org
         var pieColors         = ["#66c2a5", "#fc8d62", "#8da0cb", "#e78ac3", "#a6d854"],
             mapColors         = ["#a6cee3","#1f78b4","#b2df8a","#33a02c","#fb9a99","#e31a1c","#fdbf6f","#ff7f00"],
             bubbleColors      = ["#a6cee3", "#1f78b4", "#b2df8a", "#33a02c"],
             pieScaleColors    = d3.scale.quantize().domain([0, pieColors.length - 1]).range(pieColors),
             bubbleScaleColors = d3.scale.quantize().domain([0, bubbleColors.length - 1]).range(bubbleColors);
 
         //Define Dimensions
         var neighbourhoodsDim = ndx.dimension(function(d) { return d.NEIGHBOURHOOD; }),
             complaintsDim     = ndx.dimension(function(d) { return d.COMPLAINT; }),
             monthDim          = ndx.dimension(function(d) { return monthNames[d["MONTH_NUMBER"] - 1]; }),
             yearDim           = ndx.dimension(function(d) { return d.YEAR; }),
             initiatorDim      = ndx.dimension(function(d) { return [d["INITIATED_BY"], d.STATUS]; });
 
         //Define groups
         var groupByCount        = function(d) { return d.COUNT; },
             neighbourhoodsGroup = neighbourhoodsDim.group().reduceSum(groupByCount),
             complaintsGroup     = complaintsDim.group().reduceSum(groupByCount),
             monthGroup          = monthDim.group().reduceSum(groupByCount),
             yearGroup           = yearDim.group().reduceSum(groupByCount),
             statusGroup         = initiatorDim.group().reduceSum(groupByCount),  
             sumofAllInfractions = ndx.groupAll().reduceSum(groupByCount); 
 
         //Charts, selections, and filterCount(no var to be detected by reset link)
         //find better solution to make code secure("use strict wont allow this")
             dcMap               = dc.leafletChoroplethChart("#map-plot"),
             pie                 = dc.pieChart("#pie-plot"),
             barChart            = dc.barChart("#bar-chart"),
             rowChart            = dc.rowChart("#row-chart"),
             bubbleChart         = dc.bubbleCloud("#bubble-plot");
         var recordCounter       = dc.dataCount("#records-count"),       
             charts, neighbourSelections;
 
         recordCounter.dimension(ndx)
                      .group(ndx.groupAll())
                      .html({some:'<strong>%filter-count</strong> selected out of <strong>%total-count</strong> records. | '+
                                  '<a href= "javascript:dc.filterAll(); dc.redrawAll();">Reset All</a>',
                             all: 'All records selected. Please click on the chart(s) to apply filters.'
                            });
         recordCounter.render();
 
         charts = [dcMap, pie, barChart, rowChart, bubbleChart];
 
         //add filter listerner to update sum and percentage text
         // for all the charts
         charts.forEach(statsUpdate);
 
         dcMap
              .dimension(neighbourhoodsDim)
              .group(neighbourhoodsGroup)          
              .mapOptions({
                 center:          [53.5250, -113.4448],
                 zoom:            10,
                 scrollWheelZoom: false,
                 minZoom:         10,
                 maxZoom:         16,
                 touchZoom:       false
              })
              .geojson(neighbourhoodsGejson)
              .valueAccessor(function(d) { return d.value; })
              .colors(mapColors)
              .colorAccessor(function(d) { return d.value; })
              .featureKeyAccessor(function(feature) { return feature.properties.name; })
              .legend(dc.leafletLegend().position("bottomright"))
              .on("renderlet.dcMap",  function infractionMapInfoUpdate(chart, filter) {
                 eventTrigger(function updater() {
                     //get all the feature layers
                     var eArray = Object.values(chart.map()._layers)
                     .filter(function(e) { if( e.hasOwnProperty("feature") ) return e; } );
 
                     //get path(layer) popupContent and update the map info
                     eArray.forEach(function(layer) {
                         chart.map()._layers[layer._leaflet_id].on("mouseover", function() { 
 
                             info.update(layer);
                         });
                     });
                 });
              })
              .on("preRender.dcMap", colorUpdate)
              .on("preRedraw.dcMap", colorUpdate);
 
         rowChart.dimension(yearDim)
                 .group(yearGroup)
                 .height(setHeight(rowChart))
                 .margins(chartMargin(rowChart, {top: 0.02, right: 0.02, bottom: 0.10, left:0.02}))
                 .useViewBoxResizing(true)
                 .label(function(d) { return d.key; })
                 .title(function(d) { return d.value.toLocaleString(); })
                 .elasticX(true)
                 .on("pretransition.xAxis", fontSizeUpdate("row-chart"));
         rowChart.xAxis().ticks(6);        
 
         barChart.dimension(monthDim)
                 .group(monthGroup)
                 .height(setHeight(barChart))
                 .margins(chartMargin(barChart, {top: 0.02, right: 0.02, bottom: 0.10, left:0.12}))
                 .useViewBoxResizing(true)
                 .title(function(d) { return d.value.toLocaleString(); })
                 .x(d3.scale.ordinal().domain(monthNames))
                 .xUnits(dc.units.ordinal)
                 .elasticY(true)
                 .on("pretransition.Axis", fontSizeUpdate("bar-chart"));
         barChart.xAxis().ticks(6);           
 
         pie
            .dimension(complaintsDim)
            .group(complaintsGroup)
            .height(setHeight(pie))
            .cx(pie.width() / pieXscale)
            .radius(pie.width() * pieRscale)
            .innerRadius(pie.width() * pieInnerRscale)
            .useViewBoxResizing(true)
            .label(function(d) { return ((d.value / countSum) * 100).toFixed(3) + '%'; })
            .title(function(d) { return d.key + ': ' + ((d.value / countSum) * 100).toFixed(3) + '%'; })
            .colorAccessor(function(d, i) {return i; })
            .colors(pieScaleColors)
            .legend(dc.legend()
                      .y(Math.round(pie.height() * 0.02 , 1))
                      .gap(Math.round(pie.height() * 0.02 , 1))
             )
            .on("pretransition.legend", function legendDynamicText(chart) { 
                 eventTrigger(function textUpdater() {
                     //https://github.com/dc-js/dc.js/blob/master/web/examples/pie-external-labels.html
                     //solution for adding dynamic text to legend
                     chart.selectAll(".dc-legend-item text")   
                          .text('')
                          .append("tspan")
                          .text(function(d) { return d.name; })
                          .style("font-size", Math.round(chart.height() * 0.04, 1))
                          .append("tspan")
                          .attr('x', Math.round(pie.width() * 0.41, 1))
                          .attr('text-anchor', 'end')
                          .text(function(d) { return d.data.toLocaleString(); })
                          .style("font-size", Math.round(chart.height() * 0.04, 1));
                 });
             });
 
         bubbleChart
                    .dimension(initiatorDim)
                    .group(statusGroup)
                    .height(setHeight(bubbleChart))
                    .useViewBoxResizing(true)
                    .margins(chartMargin(barChart, {top: 0.15, right:  0.1428, bottom: 0.15, left: 0.1428}))
                    .clipPadding(55)
                    .radiusValueAccessor(function(d) { return d.value; })
                    .maxBubbleRelativeSize(0.24)
                    .r(d3.scale.linear()
                         .domain( d3.extent( bubbleChart.group().all(), bubbleChart.valueAccessor() ) ) 
                     )
                    .elasticRadius(true)
                    .x(d3.scale.ordinal())
                    .label(function(d) { return d.key[0]+": "+d.key[1]; })
                    .title(function(d) { return '('+d.key[0]+')'+d.key[1] + ': ' + d.value.toLocaleString(); })
                    .colorAccessor(function(d, i) { return i; })
                    .colors(bubbleScaleColors);
 
         dc.renderAll();
 
         //Choropleth map
         map = dcMap.map();
 
         //reset map location when window is resized
         map.on("resize", function(e) { map.setZoom(10).getBounds().getCenter(); });
 
         //----------------------------Additions to leaflet map----------------------------
         //SlideMenu, dc reset, and map info
         //https://github.com/unbam/Leaflet.SlideMenu
         title     = '<h3>Neighbourhood Selection</h3>',
         contents  = '<div id="selection" class="svg-container"></div>',
         slideMenu = L.control.slideMenu('', {position: 'topright', menuposition: 'topright', width: '70%', height: '45%', delay: '50'}).addTo(map);
 
         slideMenu.setContents(title + contents);
 
         //http://leafletjs.com/examples/choropleth.html
         info       = L.control({position: "bottomleft"});
         info.onAdd = function(map) {
             this._div = L.DomUtil.create("div", "myinfo");
             this.update();
             return this._div;
         };
         info.update = function(e) {
             this._div.innerHTML = "<span><strong>Neighbourhood Infractions</strong></span><br>" + (e ? 
             "<span>"+e._popupContent+"</span>": "Hover over a map region");
         };
 
         info.addTo(map);
 
         neighbourSelections = dc.selectMenu("#selection");
 
         //add filter listerner to update sum and percentage text
         statsUpdate(neighbourSelections);
 
         neighbourSelections.dimension(neighbourhoodsDim)
                             .group(neighbourhoodsGroup)
                             .multiple(true)
                             .numberVisible(11)
                             .controlsUseVisibility(true)
                             .order(function (a,b) { return a.value > b.value ? 1 : b.value > a.value ? -1 : 0; }); 
         neighbourSelections.render();
         //----------------------------Additions to leaflet map----------------------------
     
         //---------------------------Addition to Pie Chart Sum and Percentage Stats---------------------------
         texts = [   
             {
                 class:         "stats-title", 
                 x:             0, 
                 y:             pie.height() * 0.97, 
                 content:       "Sum:", 
                 "text-anchor": "start"
             },
                 
             {
                 id:            "sum", 
                 x:             pie.width() * 0.13, 
                 y:             pie.height() * 0.97, 
                 content:       sumofAllInfractions.value().toLocaleString(), 
                 "text-anchor": "start",
                 "font-size":   Math.round(pie.height() * 0.14, 1)
             },
 
             {
                 class:         "stats-title",
                 x:             pie.cx(), 
                 y:             pie.height() * 0.46, 
                 content:       "Percentage:",
                 "text-anchor": "middle",
             },
 
             {
                 id:            "percent", 
                 x:             pie.cx(), 
                 y:             pie.height() * 0.58, 
                 content:       ((sumofAllInfractions.value()/countSum) * 100).toFixed(3),
                 "text-anchor": "middle",
                 "font-size":   Math.round(pie.height() * 0.12, 1)
             }                       
         ];
 
         d3.select("#pie-plot svg")
           .selectAll(".stats text")
           .data(texts).enter()
           .append("text")
           .classed("stats", true)
           .style( "font-size", function(d) { return d["font-size"] ? d["font-size"] : Math.round(pie.height() * 0.08, 1); } )
           .text(function(d) { return d.content; })
           .attr({
                     id:            function(d) { return d.id ? d.id : ""; },
                     class:         function(d) { return d.class ? d.class : ""; },
                     x:             function(d) { return d.x; },
                     y:             function(d) { return d.y; },
                     "text-anchor": function(d) { return d["text-anchor"]; }
          });
         //---------------------------Addition to Pie Chart Sum and Percentage Stats---------------------------
     
         //------------Font Size for legend and label texts------------
         chartTexts = [
             {selector: "text.pie-slice"      , scale: 0.05}, 
             {selector: "text.row"            , scale: 0.05}, 
             {selector: "g.node text"         , scale: 0.04}
         ];
 
         chartTexts.forEach(function(text){textFontSize(text.selector, text.scale); });
         //------------Font Size for axis and label texts------------
 
         d3.select("#spinner").remove(); //remove spinner after files and charts are loaded
 
         function setHeight(chart) { return chart.width() * chartHeightScale; };
 
         function textFontSize(selector, scale) {
             d3.selectAll(selector)
               .style("font-size", Math.round(pie.height() * scale, 1));        
         };    
 
         function statsUpdate(chart) {
             chart.on("filtered." + chart.chartID(), function() {
                 eventTrigger(function htmlUpdater() {
                     //update the sum text
                     d3.select("#sum").html( sumofAllInfractions.value().toLocaleString() );
 
                     //update the percent text
                     d3.select("#percent").html( ((sumofAllInfractions.value()/countSum) * 100).toFixed(3) );
                 });
             });
         };  
         
         function colorUpdate(chart, filter) {
             eventTrigger(function() {
                 //update color domain to correspond with user filters
                 chart.calculateColorDomain( d3.extent(chart.group().all(), chart.valueAccessor()) ); 
             });
  
          };
 
          function fontSizeUpdate(chartId) {
             return function(chart, filter) {
                         eventTrigger(function sizeUpdater() {
                             chart.selectAll("#"+chartId+" g.tick text")
                                  .style("font-size", Math.round(chart.height() * 0.05, 1));
                         });
                     };
         };
 
         function chartMargin(chart, margin) {
             return {
                         top:    Math.round(chart.height() * margin.top , 1),
                         right:  Math.round(chart.width() * margin.right , 1),
                         bottom: Math.round(chart.height() * margin.bottom , 1),
                         left:   Math.round(chart.width() * margin.left , 1)
                     };
         };
 
         function eventTrigger(func){
             return dc.events.trigger(func);
         };
 
     }; //renderCharts
 })//document.addEventListener
      
 