/* commonjs package manager support (eg componentjs) */
if (typeof module !== "undefined" && typeof exports !== "undefined" && module.exports === exports){
  module.exports = 'treeControl';
}
(function ( angular ) {
    'use strict';

    function createPath(startScope) {
        return function path() {
            var _path = [];
            var scope = startScope;
            var prevNode;
            while (scope && scope.node !== startScope.synteticRoot) {
                if (prevNode !== scope.node)
                    _path.push(scope.node);
                prevNode = scope.node;
                scope = scope.$parent;
            }
            return _path;
        }
    }

    function ensureDefault(obj, prop, value) {
        if (!obj.hasOwnProperty(prop))
            obj[prop] = value;
    }

    function defaultIsLeaf(node, $scope) {
        return !node[$scope.options.nodeChildren] || node[$scope.options.nodeChildren].length === 0;
    }

    function shallowCopy(src, dst) {
        if (angular.isArray(src)) {
            dst = dst || [];

            for (var i = 0; i < src.length; i++) {
                dst[i] = src[i];
            }
        } else if (angular.isObject(src)) {
            dst = dst || {};

            for (var key in src) {
                if (hasOwnProperty.call(src, key) && !(key.charAt(0) === '$' && key.charAt(1) === '$')) {
                    dst[key] = src[key];
                }
            }
        }

        return dst || src;
    }
    function defaultEquality(a, b,$scope) {
        if (!a || !b)
            return false;
        a = shallowCopy(a);
        a[$scope.options.nodeChildren] = [];
        b = shallowCopy(b);
        b[$scope.options.nodeChildren] = [];
        return angular.equals(a, b);
    }

    function defaultIsSelectable() {
        return true;
    }

    function ensureAllDefaultOptions($scope) {
        ensureDefault($scope.options, "multiSelection", false);
        ensureDefault($scope.options, "nodeChildren", "children");
        ensureDefault($scope.options, "dirSelectable", "true");
        ensureDefault($scope.options, "injectClasses", {});
        ensureDefault($scope.options.injectClasses, "ul", "");
        ensureDefault($scope.options.injectClasses, "li", "");
        ensureDefault($scope.options.injectClasses, "liSelected", "");
        ensureDefault($scope.options.injectClasses, "iExpanded", "");
        ensureDefault($scope.options.injectClasses, "iCollapsed", "");
        ensureDefault($scope.options.injectClasses, "iLeaf", "");
        ensureDefault($scope.options.injectClasses, "label", "");
        ensureDefault($scope.options.injectClasses, "labelSelected", "");
        ensureDefault($scope.options, "equality", defaultEquality);
        ensureDefault($scope.options, "isLeaf", defaultIsLeaf);
        ensureDefault($scope.options, "allowDeselect", true);
        ensureDefault($scope.options, "isSelectable", defaultIsSelectable);
        ensureDefault($scope.options, "navigation", false);
    }

    angular.module( 'treeControl', [] )
        .constant('treeConfig', {
            templateUrl: null
        })
        .directive( 'treecontrol', ['$compile', function( $compile ) {
            /**
             * @param cssClass - the css class
             * @param addClassProperty - should we wrap the class name with class=""
             */
            function classIfDefined(cssClass, addClassProperty) {
                if (cssClass) {
                    if (addClassProperty)
                        return 'class="' + cssClass + '"';
                    else
                        return cssClass;
                }
                else
                    return "";
            }

            return {
                restrict: 'EA',
                require: "treecontrol",
                transclude: true,
                scope: {
                    treeModel: "=",
                    selectedNode: "=?",
                    chooseNode: "=?",
                    selectedNodes: "=?",
                    expandedNodes: "=?",
                    onSelection: "&",
                    onChoose: "&",
                    onNodeToggle: "&",
                    bindFunctionsTo: "=?",
                    options: "=?",
                    orderBy: "=?",
                    reverseOrder: "@",
                    filterExpression: "=?",
                    filterComparator: "=?",
                    filterDirective: "@"
                },
                controller: ['$scope', '$templateCache', '$interpolate', 'treeConfig', '$element', function ($scope, $templateCache, $interpolate, treeConfig, $element) {

                    $scope.options = $scope.options || {};

                    ensureAllDefaultOptions($scope);
                    $scope.focusedNode = !!$scope.treeModel ? $scope.treeModel[0] : undefined;
                    $scope.selectedNodes = $scope.selectedNodes || [];
                    $scope.expandedNodes = $scope.expandedNodes || [];
                    $scope.expandedNodesMap = {};
                    for (var i=0; i < $scope.expandedNodes.length; i++) {
                        $scope.expandedNodesMap["a"+i] = $scope.expandedNodes[i];
                    }
                    $scope.parentScopeOfTree = $scope.$parent;
                    $scope.navigationEnabled = !!$scope.options.navigation;
                    $scope.tabindex = $scope.navigationEnabled ? 'tabindex="-1"' : '';
                    $scope.visibleNodes = [];
                    $scope.transcludeMap = {};
                    if($scope.bindFunctionsTo) {
                      $scope.bindFunctionsTo = {
                        //TODO A virer
                        keyDown: function ($event) {
                          //if($scope.selectedIndex() === 0) return;
                          $scope.keyDown($event);
                        },
                        selectFirst: function() {
                          if($scope.selectedIndex() === 0) return;
                          var visibleNode = $scope.visibleNodes[0];
                          $scope.selectNodeLabel(visibleNode);
                          scrollToNode(visibleNode);
                        },
                        selectPrevious: function() {
                          var visibleNode;
                          if($scope.selectedIndex() === 0) {
                            visibleNode = $scope.visibleNodes[$scope.visibleNodes.length-1];
                          }
                          else {
                            visibleNode = $scope.visibleNodes[$scope.selectedIndex()-1];
                          }
                          $scope.selectNodeLabel(visibleNode);
                          scrollToNode(visibleNode);
                        },
                        selectNext: function() {
                          if($scope.selectedIndex() === $scope.visibleNodes.length-1) {
                            $scope.bindFunctionsTo.selectFirst();
                            return;
                          }
                          var visibleNode = $scope.visibleNodes[$scope.selectedIndex()+1];
                          $scope.selectNodeLabel(visibleNode);
                          scrollToNode(visibleNode);
                        },
                        selectLast: function() {
                          if($scope.selectedIndex() === $scope.visibleNodes.length-1) return;
                          var visibleNode = $scope.visibleNodes[$scope.visibleNodes.length-1];
                          $scope.selectNodeLabel(visibleNode);
                          scrollToNode(visibleNode);
                        },
                        expandNode: function() {
                          if(!$scope.selectedNode) return;
                          var nodeObj = $scope.transcludeMap[$scope.selectedNode.id];
                          if($scope.nodeExpanded.call(nodeObj)) return;
                          $scope.selectNodeHead.call(nodeObj);
                        },
                        collapseNode: function() {
                          if(!$scope.selectedNode) return;
                          var nodeObj = $scope.transcludeMap[$scope.selectedNode.id];
                          if(!$scope.nodeExpanded.call(nodeObj)) return;
                          $scope.selectNodeHead.call(nodeObj);
                        },
                        selectNode: function() {
                          var nodeObj = $scope.transcludeMap[$scope.selectedNode.id];
                          if(!$scope.selectedNode) return;
                          $scope.selectChooseNode.call(nodeObj);
                        }
                      }
                    }

                    function scrollToNode(node) {
                      var nodeObj = $scope.transcludeMap[node.id];
                      nodeObj.$element[0].scrollIntoView();
                    }

                    function isSelectedNode(node) {
                        if (!$scope.options.multiSelection && ($scope.options.equality(node, $scope.selectedNode , $scope)))
                            return true;
                        else if ($scope.options.multiSelection && $scope.selectedNodes) {
                            for (var i = 0; (i < $scope.selectedNodes.length); i++) {
                                if ($scope.options.equality(node, $scope.selectedNodes[i] , $scope)) {
                                    return true;
                                }
                            }
                            return false;
                        }
                    }

                    $scope.headClass = function(node) {
                        var liSelectionClass = classIfDefined($scope.options.injectClasses.liSelected, false);
                        var injectSelectionClass = "";
                        if (liSelectionClass && isSelectedNode(node))
                            injectSelectionClass = " " + liSelectionClass;
                        if ($scope.options.isLeaf(node, $scope))
                            return "tree-node tree-leaf" + injectSelectionClass;
                        if ($scope.expandedNodesMap[this.$id])
                            return "tree-node tree-expanded" + injectSelectionClass;
                        else
                            return "tree-node tree-collapsed" + injectSelectionClass;
                    };

                    $scope.iBranchClass = function() {
                        if ($scope.expandedNodesMap[this.$id])
                            return classIfDefined($scope.options.injectClasses.iExpanded);
                        else
                            return classIfDefined($scope.options.injectClasses.iCollapsed);
                    };

                    $scope.nodeExpanded = function() {
                        return !!$scope.expandedNodesMap[this.$id];
                    };

                  //TODO A virer
                  $scope.focusTree = function ($event) {
                    var ulTreeBase = $event.target;
                    if (!(ulTreeBase.getAttribute('data-skip') === 'true')) {
                      if (!$scope.focusedNode) {
                        $scope.focusedNode = $event.target.getElementsByClassName('tree-label')[0];
                      }
                    }
                    ulTreeBase.setAttribute('data-skip', false);
                  };

                  //TODO A virer
                  $scope.focusNode = function ($event) {
                    $scope.focusedNode = $event.target;
                  };

                  //TODO A virer
                  $scope.keyDown = function ($event) {
                    if (!$scope.navigationEnabled) {
                      return;
                    }
                    var transcludedScope = this;

                    var keyHandlers = {
                      13: handleEnter,
                      37: handleLeftArrow,
                      38: handleUpArrow,
                      39: handleRightArrow,
                      40: handleDownArrow,
                      106: handleStar
                    };

                    var handler = keyHandlers[$event.which];
                    if (!!handler) {
                      if ($event.which != 9) {
                        $event.preventDefault();
                      }
                      handler($event);
                    }

                    function handleDownArrow() {
                      $scope.bindFunctionsTo.selectNext();
                    }

                    function handleUpArrow() {
                      $scope.bindFunctionsTo.selectPrevious();

                    }

                    function handleLeftArrow() {
                      $scope.bindFunctionsTo.collapseNode();
                    }

                    function handleRightArrow() {
                      $scope.bindFunctionsTo.expandNode();
                    }

                    function handleEnter() {
                      $scope.bindFunctionsTo.selectNode();
                    }

                    function handleStar() {
                      $scope.expandAllChildren(transcludedScope.node);
                    }

                    $scope.isAlreadyExpanded = function(node) {
                      for (var i = 0; i < $scope.expandedNodes.length; i++) {
                        if ($scope.options.equality($scope.expandedNodes[i], node, $scope)) {
                          return true;
                        }
                      }
                      return false;
                    }

                  };

                  $scope.expandAllChildren = function(node) {
                    if (!$scope.options.isLeaf(node, $scope)) {
                      if (!$scope.isAlreadyExpanded(node)) {
                        $scope.expandedNodes.push(node);
                      }
                      angular.forEach(node[$scope.options.nodeChildren], function (childNode) {
                        $scope.expandAllChildren(childNode);
                      });
                    }
                  };

                  $scope.updateVisibleNodes = function() {
                      $scope.visibleNodes = getAllVisibleNodes();
                  };

                  $scope.selectedIndex = function() {
                    $scope.updateVisibleNodes();
                    return $scope.visibleNodes.indexOf($scope.selectedNode);
                  };

                  function getAllVisibleNodes() {
                    var elements = [];
                    $element.find('.tree-node').each(function (index, element) {
                      elements.push($(element).data('node'));
                    });
                    return elements;
                  }

                  $scope.$watch("filterExpression", function(newVal, oldVal) {
                    if(newVal !== oldVal && newVal) {
                      $scope.visibleNodes = [];
                      $scope.updateVisibleNodes();
                      $scope.expandAllChildren($scope.visibleNodes[0]);
                    }
                  });

                    $scope.selectNodeHead = function() {
                        var transcludedScope = this;
                        var expanding = $scope.expandedNodesMap[transcludedScope.$id] === undefined;
                        $scope.expandedNodesMap[transcludedScope.$id] = (expanding ? transcludedScope.node : undefined);
                        if (expanding) {
                            $scope.expandedNodes.push(transcludedScope.node);
                        }
                        else {
                            var index;
                            for (var i=0; (i < $scope.expandedNodes.length) && !index; i++) {
                                if ($scope.options.equality($scope.expandedNodes[i], transcludedScope.node , $scope)) {
                                    index = i;
                                }
                            }
                            if (index !== undefined)
                                $scope.expandedNodes.splice(index, 1);
                        }
                        if ($scope.onNodeToggle) {
                            if(!transcludedScope.$parent) return;
                            var parentNode = (transcludedScope.$parent.node === transcludedScope.synteticRoot)?null:transcludedScope.$parent.node;
                            var path = createPath(transcludedScope);
                            $scope.onNodeToggle({node: transcludedScope.node, $parentNode: parentNode, $path: path,
                              $index: transcludedScope.$index, $first: transcludedScope.$first, $middle: transcludedScope.$middle,
                              $last: transcludedScope.$last, $odd: transcludedScope.$odd, $even: transcludedScope.$even, expanded: expanding});

                        }

                    };

                    $scope.selectChooseNode = function(){
                      var transcludedScope = this;
                      if (!$scope.options.equality(transcludedScope.node, $scope.selectedNode , $scope)) {
                        $scope.selectNodeLabel(transcludedScope.node);
                      }
                      if ($scope.onChoose && $scope.selectedNode) {
                        var parentNode = (transcludedScope.$parent.node === transcludedScope.synteticRoot)?null:transcludedScope.$parent.node;
                        var path = createPath(transcludedScope);
                        $scope.chooseNode = $scope.selectedNode;
                        $scope.onChoose({node: $scope.selectedNode, selected: true, $parentNode: parentNode, $path: path,
                          $index: transcludedScope.$index, $first: transcludedScope.$first, $middle: transcludedScope.$middle,
                          $last: transcludedScope.$last, $odd: transcludedScope.$odd, $even: transcludedScope.$even});
                      }
                    };

                    $scope.selectNodeLabel = function(selectedNode, $event){
                        if ($event) {
                          $scope.focusedNode = $event.currentTarget;
                        }
                        var transcludedScope = this;
                        if(!$scope.options.isLeaf(selectedNode, $scope) && (!$scope.options.dirSelectable || !$scope.options.isSelectable(selectedNode))) {
                            // Branch node is not selectable, expand
                            this.selectNodeHead();
                        }
                        else if($scope.options.isLeaf(selectedNode, $scope) && (!$scope.options.isSelectable(selectedNode))) {
                            // Leaf node is not selectable
                            return;
                        }
                        else {
                            var selected = false;
                            if ($scope.options.multiSelection) {
                                var pos = -1;
                                for (var i=0; i < $scope.selectedNodes.length; i++) {
                                    if($scope.options.equality(selectedNode, $scope.selectedNodes[i] , $scope)) {
                                        pos = i;
                                        break;
                                    }
                                }
                                if (pos === -1) {
                                    $scope.selectedNodes.push(selectedNode);
                                    selected = true;
                                } else {
                                    $scope.selectedNodes.splice(pos, 1);
                                }
                            } else {
                                if (!$scope.options.equality(selectedNode, $scope.selectedNode , $scope)) {
                                    $scope.selectedNode = selectedNode;
                                    selected = true;
                                }
                                else {
                                    if ($scope.options.allowDeselect) {
                                        $scope.selectedNode = undefined;
                                    } else {
                                        $scope.selectedNode = selectedNode;
                                        selected = true;
                                    }
                                }
                            }
                            if ($scope.onSelection) {
                                var parentNode = (transcludedScope.$parent.node === transcludedScope.synteticRoot)?null:transcludedScope.$parent.node;
                                var path = createPath(transcludedScope);
                                $scope.onSelection({node: selectedNode, selected: selected, $parentNode: parentNode, $path: path,
                                  $index: transcludedScope.$index, $first: transcludedScope.$first, $middle: transcludedScope.$middle,
                                  $last: transcludedScope.$last, $odd: transcludedScope.$odd, $even: transcludedScope.$even});
                            }
                        }
                    };

                    $scope.selectedClass = function() {
                        var isThisNodeSelected = isSelectedNode(this.node);
                        var labelSelectionClass = classIfDefined($scope.options.injectClasses.labelSelected, false);
                        var injectSelectionClass = "";
                        if (labelSelectionClass && isThisNodeSelected)
                            injectSelectionClass = " " + labelSelectionClass;

                        return isThisNodeSelected ? "tree-selected" + injectSelectionClass : "";
                    };

                    $scope.unselectableClass = function() {
                        var isThisNodeUnselectable = !$scope.options.isSelectable(this.node);
                        var labelUnselectableClass = classIfDefined($scope.options.injectClasses.labelUnselectable, false);
                        return isThisNodeUnselectable ? "tree-unselectable " + labelUnselectableClass : "";
                    };

                    //tree template
                    $scope.isReverse = function() {
                      return !($scope.reverseOrder === 'false' || $scope.reverseOrder === 'False' || $scope.reverseOrder === '' || $scope.reverseOrder === false);
                    };

                    $scope.orderByFunc = function() {
                      return $scope.orderBy;
                    };

                    var templateOptions = {
                        orderBy: $scope.orderBy ? " | orderBy:orderByFunc():isReverse()" : '',
                        filterDirective : $scope.filterDirective ? " | "+$scope.filterDirective+":filterExpression " : " | filter:filterExpression:filterComparator ",
                        ulClass: classIfDefined($scope.options.injectClasses.ul, true),
                        nodeChildren:  $scope.options.nodeChildren,
                        liClass: classIfDefined($scope.options.injectClasses.li, true),
                        iLeafClass: classIfDefined($scope.options.injectClasses.iLeaf, false),
                        labelClass: classIfDefined($scope.options.injectClasses.label, false)
                    };

                    var template;
                    var templateUrl = $scope.options.templateUrl || treeConfig.templateUrl;

                    if(templateUrl) {
                        template = $templateCache.get(templateUrl);
                    }

                    if(!template) {
                        template =
                            '<ul {{options.ulClass}}>' +
                            '<li ng-repeat="node in node.{{options.nodeChildren}} {{options.filterDirective}} {{options.orderBy}}" ng-class="headClass(node)" {{options.liClass}}' +
                            'set-node-to-data>' +
                            '<i class="tree-branch-head" ng-class="iBranchClass()" ng-click="selectNodeHead(node)"></i>' +
                            '<i class="tree-leaf-head {{options.iLeafClass}}"></i>' +
                            '<div class="tree-label {{options.labelClass}}" ng-class="[selectedClass(), unselectableClass()]" ng-click="selectNodeHead(node)" ng-dblclick="selectChooseNode(node)" tree-transclude></div>' +
                            '<treeitem ng-if="nodeExpanded()"></treeitem>' +
                            '</li>' +
                            '</ul>';
                    }

                    this.template = $compile($interpolate(template)({options: templateOptions}));
                }],
                compile: function(element, attrs, childTranscludeFn) {
                    return function ( scope, element, attrs, treemodelCntr ) {

                        scope.$watch("treeModel", function updateNodeOnRootScope(newValue) {
                            if (angular.isArray(newValue)) {
                                if (angular.isDefined(scope.node) && angular.equals(scope.node[scope.options.nodeChildren], newValue))
                                    return;
                                scope.node = {};
                                scope.synteticRoot = scope.node;
                                scope.node[scope.options.nodeChildren] = newValue;
                            }
                            else {
                                if (angular.equals(scope.node, newValue))
                                    return;
                                scope.node = newValue;
                            }
                            scope.visibleNodes = [];
                        });

                        scope.$watch("chooseNode", function updateChoose(newValue) {
                            if (newValue && newValue.id) {
                              var nodeObj = scope.transcludeMap[newValue.id];
                              scope.selectChooseNode.call(nodeObj);
                            }
                        });

                        scope.$watchCollection('expandedNodes', function(newValue, oldValue) {
                            var notFoundIds = 0;
                            var newExpandedNodesMap = {};
                            var $liElements = element.find('li');
                            var existingScopes = [];
                            // find all nodes visible on the tree and the scope $id of the scopes including them
                            angular.forEach($liElements, function(liElement) {
                                var $liElement = angular.element(liElement);
                                var liScope = {
                                    $id: $liElement.data('scope-id'),
                                    node: $liElement.data('node')
                                };
                                existingScopes.push(liScope);
                            });
                            // iterate over the newValue, the new expanded nodes, and for each find it in the existingNodesAndScopes
                            // if found, add the mapping $id -> node into newExpandedNodesMap
                            // if not found, add the mapping num -> node into newExpandedNodesMap
                            angular.forEach(newValue, function(newExNode) {
                                var found = false;
                                for (var i=0; (i < existingScopes.length) && !found; i++) {
                                    var existingScope = existingScopes[i];
                                    if (scope.options.equality(newExNode, existingScope.node , scope)) {
                                        newExpandedNodesMap[existingScope.$id] = existingScope.node;
                                        found = true;
                                    }
                                }
                                if (!found)
                                    newExpandedNodesMap['a' + notFoundIds++] = newExNode;
                            });
                            scope.expandedNodesMap = newExpandedNodesMap;
                        });

                        //Rendering template for a root node
                        treemodelCntr.template( scope, function(clone) {
                            if(scope.navigationEnabled) {
                              clone.attr('tabindex', 0);
                            }
                            element.html('').append( clone );
                        });
                        // save the transclude function from compile (which is not bound to a scope as apposed to the one from link)
                        // we can fix this to work with the link transclude function with angular 1.2.6. as for angular 1.2.0 we need
                        // to keep using the compile function
                        scope.$treeTransclude = childTranscludeFn;
                    };
                }
            };
        }])
        .directive("setNodeToData", ['$parse', function($parse) {
            return {
                restrict: 'A',
                link: function($scope, $element, $attrs) {
                    $element.data('node', $scope.node);
                    $element.data('scope-id', $scope.$id);
                }
            };
        }])
        .directive("treeitem", function() {
            return {
                restrict: 'E',
                require: "^treecontrol",
                link: function( scope, element, attrs, treemodelCntr) {
                    // Rendering template for the current node
                    treemodelCntr.template(scope, function(clone) {
                        element.html('').append(clone);
                    });
                }
            };
        })
        .directive("treeTransclude", function () {
            return {
                controller: ['$scope',function ($scope) {
                    ensureAllDefaultOptions($scope);
                }],

                link: function(scope, element, attrs, controller) {
                    if (!scope.options.isLeaf(scope.node, scope)) {
                        angular.forEach(scope.expandedNodesMap, function (node, id) {
                            if (scope.options.equality(node, scope.node , scope)) {
                                scope.expandedNodesMap[scope.$id] = scope.node;
                                scope.expandedNodesMap[id] = undefined;
                            }
                        });
                    }
                    if (!scope.options.multiSelection && scope.options.equality(scope.node, scope.selectedNode , scope)) {
                        scope.selectedNode = scope.node;
                    } else if (scope.options.multiSelection) {
                        var newSelectedNodes = [];
                        for (var i = 0; (i < scope.selectedNodes.length); i++) {
                            if (scope.options.equality(scope.node, scope.selectedNodes[i] , scope)) {
                                newSelectedNodes.push(scope.node);
                            }
                        }
                        scope.selectedNodes = newSelectedNodes;
                    }
                    // create a scope for the transclusion, whos parent is the parent of the tree control
                    scope.transcludeScope = scope.parentScopeOfTree.$new();
                    scope.transcludeScope.node = scope.node;
                    scope.transcludeScope.$path = createPath(scope);
                    scope.transcludeScope.$parentNode = (scope.$parent.node === scope.synteticRoot)?null:scope.$parent.node;
                    scope.transcludeScope.$index = scope.$index;
                    scope.transcludeScope.$first = scope.$first;
                    scope.transcludeScope.$middle = scope.$middle;
                    scope.transcludeScope.$last = scope.$last;
                    scope.transcludeScope.$odd = scope.$odd;
                    scope.transcludeScope.$even = scope.$even;
                    scope.$element = element;
                    scope.transcludeMap[scope.node.id] = scope;
                    scope.$on('$destroy', function() {
                        scope.transcludeMap[scope.node.id] = null;
                        scope.transcludeScope.$destroy();
                        scope.$element = undefined;
                    });

                    scope.$treeTransclude(scope.transcludeScope, function(clone) {
                        element.empty();
                        element.append(clone);
                    });
                }
            };
        });
})( angular );
