function main() {
    
    //To be overwritten later
    var edmontonGeojson  = false,
        bylawInfractions = false;


    //Edmonton geojson
    d3.json("data/Edmonton2.json", function(data) {

        edmontonGeojson = data;

        if (bylawInfractions) renderCharts(bylawInfractions, edmontonGeojson);
    });


    //Infractions data
    d3.csv("data/Bylaw_Infractions.csv", function(data) {

        bylawInfractions = data;
        
        if (edmontonGeojson) renderCharts(bylawInfractions, edmontonGeojson);
    });    


    function renderCharts(csv, neighbourhoodsGejson) {

        //Clean data - use only the properties needed
        //This is data from Bylaw_Infractions.csv about 60k rows(2017 data is Jan to Sep)
        var dataParsed = csv.map(function(d) {

            return {
                        YEAR:           +d.YEAR,
                        "MONTH_NUMBER": +d["MONTH_NUMBER"],
                        NEIGHBOURHOOD:  d.NEIGHBOURHOOD,
                        COMPLAINT:      d.COMPLAINT,
                        "INITIATED_BY": d["INITIATED_BY"],
                        STATUS:         d.STATUS,
                        COUNT:          +d.COUNT
                    };
        });
        delete csv; 


        //Crossfilter instance
        var ndx = crossfilter(dataParsed);


        //Define values to be used by chart(s)
        var northEast        = L.latLng(53.72434177851913, -113.15643310546875),
            southWest        = L.latLng(53.32431151982718, -113.73321533203125),
            bounds           = L.latLngBounds(southWest, northEast),
            chartHeightScale = 0.522,
            pieXscale        = 1.45,
            pieRscale        = chartHeightScale * 0.5,
            pieInnerRscale   = pieRscale * 0.5,
            monthNames       = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
            countSum         = dataParsed.map( function(d) { return d.COUNT; } )
                                         .reduce( function(sum, value) { return sum + value; }, 0 ),
            map,
            info,
            mapReset,
            title,
            texts,
            chartTexts,
            slideMenu;


        //Colors and color scales
        //Got the colors from http://colorbrewer2.org
        var pieColors         = ["#66c2a5", "#fc8d62", "#8da0cb", "#e78ac3", "#a6d854"],
            mapColors         = ["#d1e5f0", "#92c5de", "#4393c3", "#2166ac", "#053061"],
            bubbleColors      = ["#a6cee3", "#1f78b4", "#b2df8a", "#33a02c"],
            pieScaleColors    = d3.scale.quantize().domain([0, pieColors.length - 1]).range(pieColors),
            bubbleScaleColors = d3.scale.quantize().domain([0, mapColors.length - 1]).range(bubbleColors);

        
        //Define Dimensions
        var neighbourhoodsDim = ndx.dimension( function(d) { return d.NEIGHBOURHOOD; } ),
            complaintsDim     = ndx.dimension( function(d) { return d.COMPLAINT; } ),
            monthDim          = ndx.dimension( function(d) { return monthNames[d["MONTH_NUMBER"] - 1]; } ),
            yearDim           = ndx.dimension( function(d) { return d.YEAR; } ),
            initiatorDim      = ndx.dimension( function(d) { return [d["INITIATED_BY"], d.STATUS]; } );


        //Define groups
        var groupByCount        = function(d) { return d.COUNT; },
            neighbourhoodsGroup = neighbourhoodsDim.group().reduceSum(groupByCount),
            complaintsGroup     = complaintsDim.group().reduceSum(groupByCount),
            monthGroup          = monthDim.group().reduceSum(groupByCount),
            yearGroup           = yearDim.group().reduceSum(groupByCount),
            statusGroup         = initiatorDim.group().reduceSum(groupByCount),  
            sumofAllInfractions = ndx.groupAll().reduceSum(groupByCount); 

            
        //Charts, selections, and filterCount(no var to be detected by reset link)
            dcMap               = dc.leafletChoroplethChart("#map-plot"),
            pie                 = dc.pieChart("#pie-plot"),
            barChart            = dc.barChart("#bar-chart"),
            rowChart            = dc.rowChart("#row-chart"),
            bubbleChart         = dc.bubbleCloud("#bubble-plot");
        var recordCounter       = dc.dataCount("#records-count"),       
            charts,       
            neighbourSelections;


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
        charts.forEach(function(chart){

            chart.on("filtered." + chart.chartID(), function() {

                //update the sum text
                d3.select("#sum").html( sumofAllInfractions.value().toLocaleString() );

                //update the percent text
                d3.select("#percent").html( ((sumofAllInfractions.value()/countSum) * 100).toFixed(3) );
                
            })
        });


        dcMap
             .dimension(neighbourhoodsDim)
             .group(neighbourhoodsGroup)          
             .mapOptions({
                center:          [53.5250, -113.4448],//53.5562
                zoom:            10,
                scrollWheelZoom: false,
                maxBounds:       bounds,
                minZoom:         10
             })
             .geojson(neighbourhoodsGejson)
             .valueAccessor( function(d) { return d.value; } )
             .colors(mapColors)
             .colorAccessor( function(d) { return d.value; } )
             .featureKeyAccessor( function(feature) { return feature.properties.name; } )
             .brushOn(true)
             .legend(dc.leafletLegend().position("bottomright"))
             .on("renderlet.dcMap", function(chart, filter) {

                //get all the feature layers
                var eArray = Object.values(chart.map()._layers)
                                   .filter( function(e) { if( e.hasOwnProperty("feature") ) return e; } );

                //get path(layer) popupContent and update the map info
                eArray.forEach(function(layer) {
                    chart.map()._layers[layer._leaflet_id].on("mouseover", function(){ 

                        info.update(layer);
                    });
                });
                
             })
             .on("preRender.dcMap", function(chart, filter) {

                //update color domain to correspond with user filters
                chart
                     .calculateColorDomain( d3.extent(chart.group().all(), chart.valueAccessor()) );                    
             })
             .on("preRedraw.dcMap", function(chart, filter) {

                //update color domain to correspond with user filters
                chart
                     .calculateColorDomain( d3.extent(chart.group().all(), chart.valueAccessor()) );  
             });
        dcMap.render();

        
        //Leaflet map
        map = dcMap.map();

        //reset map location when window is resized
        map.on("resize", function(e) {

            map.setView([53.5250, -113.4448], 10);
            map.fitBounds(bounds);
        });

        //----------------------------Additions to leaflet map----------------------------
        //SlideMenu, dc reset, and map info
        //https://github.com/unbam/Leaflet.SlideMenu
        title     = '<h2>Neighbourhood Selection</h2>',
        contents  = '<div id="selection" class="svg-container"></div>',
        slideMenu = L.control.slideMenu('', {position: 'topright', menuposition: 'topright', width: '70%', height: '68%', delay: '50'}).addTo(map);

        slideMenu.setContents(title + contents);


        //http://leafletjs.com/examples/choropleth.html
        info       = L.control({position: "bottomleft"});
        info.onAdd = function(map) {
            this._div = L.DomUtil.create("div", "myinfo");
            this.update();
            return this._div;
        };
        info.update = function(e) {
            this._div.innerHTML = "<h4>Neighbourhood Infractions</h4>" + (e ? 
            "<span>"+e._popupContent+"</span>": "Hover over a map region");
        };

        info.addTo(map);


        mapReset       = L.control({position: "bottomleft"});
        mapReset.onAdd = function(map) {
            this._span           = L.DomUtil.create("span", "myinfo");
            this._span.innerHTML = '<a class="reset" style="display:none" href="javascript:dcMap.filterAll(); dc.redrawAll();">reset</a>';
            return this._span;
        };

        mapReset.addTo(map);
        //---------------------------------------------------------------------------------
    

        neighbourSelections = dc.selectMenu("#selection");

        //add filter listerner to update sum and percentage text for selections in slide menu 
        neighbourSelections.on("filtered.selection", function() {

            //update the sum text
            d3.select("#sum").html( sumofAllInfractions.value().toLocaleString() );

            //update the percent text
            d3.select("#percent").html( ((sumofAllInfractions.value()/countSum) * 100).toFixed(3) );
        });

        neighbourSelections.dimension(neighbourhoodsDim)
                           .group(neighbourhoodsGroup)
                           .multiple(true)
                           .numberVisible(11)
                           .controlsUseVisibility(true)
                           .order(function (a,b) {
                                return a.value > b.value ? 1 : b.value > a.value ? -1 : 0;
                           }); 
        neighbourSelections.render();


        rowChart.dimension(yearDim)
                .group(yearGroup)
                .height(setHeight(rowChart))
                .useViewBoxResizing(true)
                .label(function(d) { return d.key; })
                .title(function(d) { return d.value.toLocaleString(); })
                .elasticX(true);
        rowChart.render();


        barChart.dimension(monthDim)
                .group(monthGroup)
                .height(setHeight(barChart))
                .margins(
                    {
                        top:    Math.round(barChart.height() * 0.02 , 1),
                        right:  Math.round(barChart.width() * 0.08 , 1),
                        bottom: Math.round(barChart.height() * 0.08 , 1),
                        left:   Math.round(barChart.width() * 0.10 , 1)
                    }
                )
                .useViewBoxResizing(true)
                .title(function(d) { return d.value.toLocaleString(); })
                .x(d3.scale.ordinal().domain(monthNames))
                .xUnits(dc.units.ordinal)
                .elasticY(true);
        barChart.render();  


        pie
           .dimension(complaintsDim)
           .group(complaintsGroup)
           .height(setHeight(pie))
           .cx(pie.width() / pieXscale)
           .radius(pie.width() * pieRscale)
           .innerRadius(pie.width() * pieInnerRscale)
           .useViewBoxResizing(true)
           .label( function(d) { return ((d.value / countSum) * 100).toFixed(3) + '%'; } )
           .title( function(d) { return d.key + ': ' + ((d.value / countSum) * 100).toFixed(3) + '%'; } )
           .colorAccessor( function(d, i) {return i; } )
           .colors(pieScaleColors)
           .legend(dc.legend())
           .on("pretransition.legend", function(chart) { 
            
                //https://github.com/dc-js/dc.js/blob/master/web/examples/pie-external-labels.html
                //solution for adding dynamic text to legend
                chart.selectAll(".dc-legend-item text")   
                     .text('')
                     .append("tspan")
                     .text( function(d) { return d.name; } )
                     .append("tspan")
                     .attr('x', Math.round(pie.width() * 0.35, 1))
                     .attr('text-anchor', 'end')
                     .text( function(d) { return d.data.toLocaleString(); } );
            });
        pie.render();


        //---------------------------Sum and Percentage Stats---------------------------
        texts = [   {
                        class:         "stats-title", 
                        x:             0, 
                        y:             pie.height() * 0.97, 
                        content:       "Sum:", 
                        "text-anchor": "start"
                    },
                        
                    {
                        id:            "sum", 
                        x:             pie.width() * 0.11, 
                        y:             pie.height() * 0.97, 
                        content:       sumofAllInfractions.value().toLocaleString(), 
                        "text-anchor": "start",
                        "font-size":   Math.round(pie.height() * 0.15, 1)
                    },

                    {
                        class:         "stats-title",
                        x:             pie.cx(), 
                        y:             pie.height() * 0.46, 
                        content:       "Percentage:",
                        "text-anchor": "middle"
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

        d3.select("#pie-plot > svg")
          .selectAll("texts")
          .data(texts).enter()
          .append("text")
          .style( "font-size", function(d) { return d["font-size"] ? d["font-size"] : Math.round(pie.height() * 0.08, 1); } )
          .text( function(d) { return d.content; } )
          .attr({
                id:            function(d) { return d.id ? d.id : ""; },
                class:         function(d) { return d.class ? d.class : ""; },
                x:             function(d) { return d.x; },
                y:             function(d) { return d.y; },
                "text-anchor": function(d) { return d["text-anchor"]; }
           });
        //--------------------------------------------------------------------------------


        bubbleChart
                   .dimension(initiatorDim)
                   .group(statusGroup)
                   .height(setHeight(bubbleChart))
                   .useViewBoxResizing(true)
                   .margins({
                        top:    Math.round(bubbleChart.height() * 0.15, 1),
                        right:  Math.round(bubbleChart.width() * 0.1428, 1),
                        bottom: Math.round(bubbleChart.height() * 0.15, 1),
                        left:   Math.round(bubbleChart.width() * 0.1428, 1)
                    })
                   .clipPadding(55)
                   .radiusValueAccessor( function(d) { return d.value; } )
                   .maxBubbleRelativeSize(0.22)
                   .r(d3.scale.linear()
                        .domain( d3.extent( bubbleChart.group().all(), bubbleChart.valueAccessor() ) ) 
                    )
                   .elasticRadius(true)
                   .x(d3.scale.ordinal())
                   .label( function(d) { return d.key[0]+": "+d.key[1]; } )
                   .title( function(d) { return '('+d.key[0]+')'+d.key[1] + ': ' + d.value.toLocaleString(); } )
                   .colorAccessor( function(d, i) { return i; } )
                   .colors(bubbleScaleColors);
        bubbleChart.render();
        
        //------------Font Size for axis and label texts------------
        chartTexts = [ {selector: "text.pie-slice"       , scale: 0.05}, 
                       {selector: "text.row"             , scale: 0.05}, 
                       {selector: "g.node text"          , scale: 0.04}, 
                       {selector: "g.tick text"          , scale: 0.04}, 
                       {selector: "g.dc-legend-item text", scale: 0.045}
                    ];

        chartTexts.forEach(function(text){
            textFontSize(text.selector, text.scale);
        });
        //----------------------------------------------------------


        function setHeight(chart) { 
            return chart.width() * chartHeightScale; 
        }
        
        function textFontSize(selector, scale) {
            d3.selectAll(selector)[0].forEach(function(d){
                d3.select(d).style("font-size", Math.round(pie.height() * scale, 1));
            })            
        }        
    
        
    }; //renderCharts

} //main
     
window.onload = main;

