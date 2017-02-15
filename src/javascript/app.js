Ext.define("portfolio-iteration-summary", {
    extend: 'Rally.app.App',
    componentCls: 'app',
    logger: new Rally.technicalservices.Logger(),
    defaults: { margin: 10 },
    items: [
        {xtype:'container',itemId:'selector_box', layout: 'hbox'},
        {xtype:'container',itemId:'display_box'}
    ],

    integrationHeaders : {
        name : "portfolio-iteration-summary"
    },
   
    config: {
        defaultSettings: {
            piTypeField: 'PortfolioItem/Feature'
        }
    },

    getSettingsFields: function() {
        var me = this;

        return [{
            xtype: 'rallyportfolioitemtypecombobox',
            name: 'piTypeField',
            itemId:'piTypeField',
            fieldLabel: 'Select PI Type',
            labelWidth: 125,
            labelAlign: 'left',
            minWidth: 200,
            displayField:'TypePath',
            valueField:'TypePath'           
        }];

    },
    launch: function() {
        var me = this;
        //console.log("PI Set")
        me.setLoading("Loading Iterations");
        Deft.Promise.all([
            me.fetchIterations()
        ], me).then({
        //CArABU.technicalservices.Utility.fetchPortfolioItemTypes().then({
            success: me.addPickers,
            failure: me.showErrorNotification,
            scope: me
        });
    },

    addPickers: function(results){
        var me = this;
        var iterations = results[0];

        // this.portfolioItemTypes = portfolioItemTypes;
        // this.logger.log('addPortfolioPickerx', results, portfolioItemTypes,portfolioItemTypes.slice(0,2), iterations);

        this.getSelectorBox().removeAll();

        this.getSelectorBox().add({
            xtype: 'rallyartifactsearchcombobox',
            width: 500,
            labelWidth: 100,
            fieldLabel: "Portfolio Item",
            labelAlign: 'right',
            remoteFilter: true,
            storeConfig: {
                pageSize: 200,
                models: [me.getSetting('piTypeField')],
                context: {project: null}
            }
        });

        var iterationHash = {},
            iterationNames = [];

        for (var i=0; i<iterations.length; i++){
            var iteration = iterations[i];
            iterationHash[iteration.get('ObjectID')] =iteration.getData();
            if (!Ext.Array.contains(iterationNames, iteration.get('Name'))){
                iterationNames.push(iteration.get('Name'));
                //iterationNames.push({_refObjectName: iteration.get('Name'), _ref: iteration.get('Name')});
            }
        }
        this.logger.log('iterations', iterations, iterationHash, iterationNames);
        this.iterationHash = iterationHash;
        this.getSelectorBox().add({
            xtype:'rallycombobox',
            fieldLabel: 'Iterations',
            itemId: 'cbIteration',
            margin: '0 10 0 10',
            width: 200,
            labelAlign: 'right',
            store: Ext.create('Rally.data.custom.Store',{
                data: _.map(iterationNames, function(i){ return {_refObjectName: i, _ref: i}; }),
                fields: ['_refObjectName','_ref'],
                pageSize:2000
            }),
            multiSelect: true
        });

        this.getSelectorBox().add({
                xtype: 'rallybutton',
                text: 'Update',
                margin: '0 10 0 10',
                listeners: {
                    click: this.updateView,
                    scope: this
                }
            });
        me.setLoading(false);
    },
    getSelectorBox: function(){
        return this.down('#selector_box');
    },
    getDisplayBox: function(){
        return this.down('#display_box');
    },
    getPortfolioItem: function(){
        return this.down('rallyartifactsearchcombobox') && this.down('rallyartifactsearchcombobox').getRecord() || null;
    },
    updateView: function(){

        this.getDisplayBox().removeAll();

        var pi = this.getPortfolioItem();
        this.logger.log('updateView', pi);
        if (!pi ){
            this.showNoData("Please select a portfolio item.");
            return;
        }

        var iterations = this.down('#cbIteration').getValue() || [];

        this.logger.log('updateView', pi, iterations);

        this.fetchStorySnapshots(iterations, pi);


    },
    getFeatureFieldName: function(){
        return this.portfolioItemTypes && this.portfolioItemTypes[0] && this.portfolioItemTypes[0].replace("PortfolioItem/","") || null;
    },
    getPortfolioFilter: function(pi){
        var type = pi.get('_type');
        this.logger.log('fetchStories',type);
        var idx = 0;
        Ext.Array.each(this.portfolioItemTypes, function(t){
            if (t.toLowerCase() === type){
                return false;
            }
            idx++;
        });

        var property = this.getFeatureFieldName();
        if (idx > 0){
            property = property + ".Parent";
        }
        property = property + '.ObjectID';

        return Ext.create('Rally.data.wsapi.Filter',{
            property: property ,
            value: pi.get('ObjectID')
        });
    },
    fetchIterations: function(){
        return CArABU.technicalservices.Utility.fetchWsapiRecords({
            model: 'Iteration',
            fetch: ['Name','ObjectID','StartDate','EndDate','Project'],
            limit: 'Infinity',
            enablePostGet:true,
            sorters: [{
                property: 'EndDate',
                direction: 'DESC'
            }]
        });
    },
    getStorySnapshotFetchList: function(){
        return ['ObjectID','Iteration','Release','PlanEstimate','ScheduleState','AcceptedDate','TaskEstimateTotal','TaskRemainingTotal','Project','_ValidFrom','_ValidTo'];
    },
    fetchStorySnapshots: function(iterations, pi){
        this.logger.log('fetchStorySnapshots',iterations, pi);


        var selectedIterationOids = [],
            iterationHash = this.iterationHash;
        Ext.Object.each(iterationHash, function(oid, data){
            if (Ext.Array.contains(iterations, data.Name)){
                selectedIterationOids.push(Number(oid));
            }
        });
        this.logger.log('fetchStorySnapshots selectedIterationOids', selectedIterationOids);
        var find = {
            _TypeHierarchy: 'HierarchicalRequirement',
            _ItemHierarchy: pi.get('ObjectID'),
            __At: "current"
        };
        if (selectedIterationOids.length > 0){
            find.Iteration = {$in: selectedIterationOids};
        } else {
            find.Iteration = {$ne: null};
        }

        this.setLoading(true);
        CArABU.technicalservices.Utility.fetchSnapshots({
            find: find,
            fetch: this.getStorySnapshotFetchList(),
            hydrate: ['Project', 'Iteration'],
            useHttpPost:true
        }).then({
            success: function(snapshots){
                this.processSnapshots(snapshots, selectedIterationOids, iterations, pi);
            },
            failure: this.showErrorNotification,
            scope: this
        }).always(function(){
            this.setLoading(false);
        }, this);
    },
    processSnapshots: function(snapshots, selectedIterationOids, selectedIterationNames, pi){
        this.logger.log('processSnapshots', snapshots, selectedIterationOids, pi);

        //Organize Snapshots by project
        var projectHash = {},
            iterationHash = this.iterationHash;

        for (var i=0; i<snapshots.length; i++){

            var snap = snapshots[i].getData(),
                projectName = snap.Project.Name;

            if (!projectHash[projectName]){
                projectHash[projectName] = {snaps: []};
            }

            if (snap.Iteration){
                var iterationOid = snap.Iteration.ObjectID;
                if (Ext.Array.contains(selectedIterationOids, iterationOid) || selectedIterationOids.length === 0){
                    projectHash[projectName].snaps.push(snap);
                }
            }
        }

        this.logger.log('processSnapshots', projectHash, iterationHash);


        var data = [];
        Ext.Object.each(projectHash, function(key, obj){
            var row = {project: key},
                snaps = obj.snaps;

            Ext.Array.each(selectedIterationNames, function(n){
                var name = this.keyify(n);
                row[name] = 0;
                Ext.Array.each(snaps, function(s){
                    if (s.Iteration && s.Iteration.Name === n){
                        console.log('s', s.PlanEstimate, s.Iteration.Name, n, key,row[name]);
                        row[name] += (s.PlanEstimate || 0);
                    }
                });
            }, this);
            data.push(row);
        }, this);

        this.addGrid(data, selectedIterationNames);
    },
    keyify: function(key){
        return key.toString().split('.').join('x');
    },
    addGrid: function(data, iterationNames){

        var fields = [{name: 'project', displayName: 'Project'}];
        Ext.Array.each(iterationNames, function(n){
            var name = this.keyify(n);
            fields.push({name: name, displayName: n});
        }, this);


        this.logger.log('addGrid', data, fields);
        this.getDisplayBox().add({
            xtype: 'rallygrid',
            store: Ext.create('Rally.data.custom.Store',{
                data: data,
                fields: fields,
                pageSize: data.length
            }),
            margin: '25 0 0 0',
            columnCfgs: this.getColumnCfgs(fields),
           // pageSize: data.length,
            showPagingToolbar: false,
            showRowActionsColumn: false
        });
    },

    getColumnCfgs: function(fields){

        var cols = [{
            dataIndex: 'project',
            text: 'Project',
            flex: 2
        }];
        Ext.Array.each(fields, function(f){
            if (f.name !== 'project'){
                cols.push({
                    dataIndex: f.name,
                    text: f.displayName,
                    flex: 1
                });
            }
        });
        this.logger.log('getColumnCfgs', cols);
        return cols;
    },
    showErrorNotification: function(msg){
        this.setLoading(false);
        Rally.ui.notify.Notifier.showError({message: msg});
    },
    showNoData: function(msg){

        if (!msg){
            msg = 'No data found for the selected item.';
        }

        this.getDisplayBox().add({
            xtype: 'container',
            html: '<div class="no-data-container"><div class="secondary-message">' + msg + '</div></div>'
        });
    },
    getOptions: function() {
        return [
            {
                text: 'About...',
                handler: this._launchInfo,
                scope: this
            }
        ];
    },
    _launchInfo: function() {
        if ( this.about_dialog ) { this.about_dialog.destroy(); }
        this.about_dialog = Ext.create('Rally.technicalservices.InfoLink',{});
    },
    isExternal: function(){
        return typeof(this.getAppId()) == 'undefined';
    },
    onSettingsUpdate: function (settings){
        this.logger.log('onSettingsUpdate',settings);
        // Ext.apply(this, settings);
        this.launch();
    }
});
