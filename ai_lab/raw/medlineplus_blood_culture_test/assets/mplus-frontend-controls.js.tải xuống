//Any needed global variables that the module may need to interact with
var _pid='';

var mplus_lang='';
try {
  mplus_lang=document.getElementsByTagName('HTML')[0].getAttribute('lang').toUpperCase();
} catch (error) {
  mplus_lang='EN'
}

//Main Module
(function ($) {
    //JS enabled, so show and hide special JS areas
    $(".nojs").removeClass("nojs");


    var lang = 'en';
    if($("html").hasClass("esm")) {
        lang = 'es';
    }

    // get the page type id
    _pid = $("html").attr('id');
    _root = $("html").data('root');


	var messages = {
		'en' : {
            'search' : "The site search",
            'clear-search' : "Clear search",
            'menu' : "The navigation menu",
            'collapse' : "has been collapsed.",
            'expand' : "has been expanded.",
            'moreless' : "Additional information in this section",
            'slide' : "The slideshow has changed to slide number ",
            'play' : "Play Slideshow",
            'pause' : "Pause Slideshow",
            'section-expand': "Expand Section",
            'section-collapse': "Collapse Section",
            'show': "Show",
            'hide': "Hide",
            'show-references': "Show references",
            'hide-references': "Hide references"
		},
		'es' : {
            'search' : "El cuadro de búsqueda",
            'clear-search' : "Borrar búsqueda",
            'menu' : "El menú de navegación",
            'collapse' : "ha sido ocultado.",
            'expand' : "ha sido extendido.",
            'moreless' : "Información adicional en esta sección",
            'slide' : "La presentación ha cambiado a la diapositiva número ",
            'play' : "Empezar diapositivas",
            'pause' : "Detener las diapositivas",
            'section-expand': "Expanda sección",
            'section-collapse': "Colapse sección",
            'show': "Mostrar el campo de",
            'hide': "Ocultar el campo de",
            'show-references': "Mostrar referencias",
            'hide-references': "Ocultar referencias"
		}
	}

	/* Initalization Functions */
	initButtons();
	initMobileMenu();
  initMobileSections();
  initMobileSectionsPM();
  initReferenceSections();
  initReferenceSectionsPM();
  initMoreListPM();

  initSideMore();
 	initListBreak();
  initCategoryNavArea();
  initReturnToTop();
  initSlideShow();
  initSearchClear();
  initPlaceholderFix(); //Fix for IE8-9 only
	initDictionaryFix(); //Fix for iOS7
  //initSurveryDisclaimer();
  if ($("link[rel='canonical']").attr("href").indexOf('coronavirus') === -1) {
    initPageFeedback();
  }
  initGovDSubmit();
  initVideoJumpLinks();
  initImageModals();

	/* Functions */
    function initMobileMenu() {
        $("#mplus-nav .navmenu-btn .hide-offscreen").text(messages[lang]['show']+" ");
    	$("#mplus-nav .navmenu-btn").click(function (event) {
    		var button = $(this);
    		var Options = {
    			"sm-menu-btn" : "menu",
    			"sm-search-btn" : "search",
    		}
    		//Expand
    		if(!button.hasClass("expanded")){
	        	//Get expand accesibility message
	        	var msg = messages[lang][Options[button.attr('id')]]+" "+messages[lang]['expand'];
	           //Check another option is currently expanded, if so collapse it
	           $("#mplus-nav .navmenu-btn.expanded").each(function(index) {
	           		var other = $(this);
	           		//Hide unselected option
		       		$("#"+other.attr('id')+", "+"#"+other.attr('aria-controls')).removeClass("expanded");
		       		//Add the unselected option's collapse accesibility message
	                msg = messages[lang][Options[other.attr('id')]]+" "+messages[lang]['collapse']+" " + msg;
		            //Fix the button's acessibility pressed/expanded area
		            $("#"+other.attr('id')).attr('aria-pressed', 'false');
		            $("#"+other.attr('aria-controls')).removeAttr('aria-expanded');
                    //Update Button Text
                    $(other).children(".hide-offscreen").text(messages[lang]['show']+" ");
	           });
	            //Show the selected area
	           	$("#"+button.attr('id')+", "+"#"+button.attr('aria-controls')).addClass("expanded");
                //Update Button Text
                $(button).children(".hide-offscreen").text(messages[lang]['hide']+" ");
	            //Update the live accesibility message
	            $("#mplus-nav .sm-live-area").html(msg);
	            //Update the button's acessibility expanded
	            $("#"+button.attr('aria-controls')).attr('aria-expanded', 'true');

    		}
    		//Collapse
    		else {
		        //Hide the selected area
		       	$("#"+button.attr('id')+", "+"#"+button.attr('aria-controls')).removeClass("expanded");
                //Update Button Text
                $(button).children(".hide-offscreen").text(messages[lang]['show']+" ");
				//Update the live accesibility message
				$("#mplus-nav .sm-live-area").html(messages[lang][Options[button.attr('id')]]+" "+messages[lang]['collapse']);
	            //Update the button's acessibility expanded
	            $("#"+button.attr('aria-controls')).removeAttr('aria-expanded');
    		}
    	});
 	}
 	function initButtons (){
 		$('[role="button"]').attr('aria-pressed', 'false');
 		$('[role="button"]').attr('tabindex', '0');
 		$('[role="button"]').click(function (event) {
 			var button = $(this);
 			(button.attr('aria-pressed') == 'true') ? button.attr('aria-pressed', 'false') : button.attr('aria-pressed', 'true');
 		});
 	}

  function initReferenceSections (){
    if(_pid == "lab_test") {
      $(".references").hide();
      $(".references").after('<a id="ref-more" href="javascript:void(0);">'+messages[lang]['show-references']+'</a>');
      $("#ref-more").css({"display": "inline-block", "font-weight": "bold", "margin-bottom": "1em" })
      $("#ref-more").click(function () {
        if ($(this).hasClass("expanded")) {
          $(this).removeClass("expanded");
          $(this).text(messages[lang]['show-references']);
          $(".references").hide();
        } else {
          $(this).addClass("expanded");
          $(this).text(messages[lang]['hide-references']);
          $(".references").show();
        }
      })
    }
  }
  function initReferenceSectionsPM (){
    $(".mp-refs").hide();
    $('.mp-refs').each(function(id) {
      $(this).attr('id', 'refs-'+id);
      $(".mp-refs").after('<a id="refs-btn-'+id+'" class="refs-btn" href="javascript:void(0);">'+messages[lang]['show-references']+'</a>');
      $("#refs-btn-"+id).css({"display": "inline-block", "font-weight": "bold", "margin-bottom": "1em" })
      $("#refs-btn-"+id).click(function () {
        if ($(this).hasClass("expanded")) {
          $(this).removeClass("expanded");
          $(this).text(messages[lang]['show-references']);
          $("#refs-"+id).hide();
        } else {
          $(this).addClass("expanded");
          $(this).text(messages[lang]['hide-references']);
          $("#refs-"+id).show();
        }
      })
    });
  }
  function initMoreListPM() {
      // Add button after each list to control it
      // $(".mp-refs").hide();
      $('.mp-more-list').each(function(id) {
        $(this).attr('id', 'more-list-'+id);
        $(this).after('<button id="more-btn-'+id+'" class="more-btn">Show More</button>');
        $(this).find("li:gt(2)").hide();
        // $("#refs-btn-"+id).css({"display": "inline-block", "font-weight": "bold", "margin-bottom": "1em" })
        $("#more-btn-"+id).click(function () {
          if ($(this).hasClass("expanded")) {
            $(this).removeClass("expanded");
            $("#more-list-"+id).find("li:gt(2)").hide();
            $(this).text("Show More");
          } else {
            $(this).addClass("expanded");
            $("#more-list-"+id).find("li:gt(2)").show();
            $(this).text("Show Less");
          }
        })
      });
  }
  function initMobileSectionsPM (){
    // get first h2 or h3 in div
    $('.mp-exp').each(function(id) {
      var header = $(this).find(">h2:first-child");
      if (header.length == 0) {
        header = $(this).find(">h3:first-child");
      }
      if (header.length) {
        $(this).attr('id', 'exp-'+id);
        var expclass = "";
        var exptext = "section-expand";
        var exppressed = "false";
        var bookmark = $(this).data("bookmark");
        var bookmark_text = "";
        if (bookmark) {
          bookmark_text = 'id="'+bookmark+'" ';
        }
        if(id == 0) { // expand first
          expclass = " expanded";
          exptext = "section-collapse";
          exppressed = "true";
        }
        var body = $(this).children().not(":header:first").wrapAll('<div class="exp-body'+expclass+'"></div>');
        $("#exp-"+id+" .exp-body").attr('id', 'exp-body'+id);
        header.wrap("<div class='exp-header"+expclass+"'></div>");
        header.wrap("<div class='exp-title'></div>");
        $("#exp-"+id+" .exp-header").append(
          '<div class="exp-button">'
          +'<button '+bookmark_text+'title="'+messages[lang][exptext]+'" role="button" aria-controls="exp-body'+id+'" aria-pressed="'+exppressed+'" type="submit">'
          +'<span class="icon icon-section-action"></span><span class="hide-offscreen">'+messages[lang][exptext]+'</span>'
          +'</button></div>'
        );
        $("#exp-"+id+" .exp-header").append('<div aria-live="polite" class="sm-live-area hide-offscreen"></div>');
      }
    });

    $(".mp-exp .exp-header").click(function () {
        //toggle section
        if ($(this).children(".exp-button").css('display') != 'none') {
            var head = $(this);
            var button = $(head).children(".exp-button").children("button");
            if($(head).children(".exp-title").children(":header:first").length) {
                var title =  $(head).children(".exp-title").children(":header:first").text();
                var bookmark =  $(head).parent().data("bookmark");
                //Collapse
                if ($(head).hasClass("expanded")) {
                    if (bookmark) {
                      history.replaceState("", document.title, window.location.pathname+window.location.search);
                      $("#"+bookmark).focus();
                    }
                    $(head).removeClass("expanded");
                    $(head).parent().children(".exp-body").removeClass("expanded");
                    $(head).children(".sm-live-area").text(title+" "+messages[lang]['collapse']);
                    $("#"+button.attr('aria-controls')).removeAttr('aria-expanded');
                    $(button).attr('title', messages[lang]['section-expand']);
                    $(button).children(".hide-offscreen").text(messages[lang]['section-expand']);
                //Expand
                } else {
                    if (bookmark) {
                      history.replaceState("", document.title, window.location.pathname+window.location.search+"#"+bookmark);
                      $("#"+bookmark).focus();
                    }
                    $(head).addClass("expanded");
                    $(head).parent().children(".exp-body").addClass("expanded");
                    $(head).children(".sm-live-area").text(title+" "+messages[lang]['expand']);
                    $("#"+button.attr('aria-controls')).attr('aria-expanded', 'true');
                    $(button).attr('title', messages[lang]['section-collapse']);
                    $(button).children(".hide-offscreen").text(messages[lang]['section-collapse']);
                }
            }
        }
    });

    $(".expand-all").click(function () {
        if ($(".mp-exp .exp-header").length) {
            var header = $(".mp-exp .exp-header");
            if ($(header).children(".exp-button").css('display') != 'none') {
                if ($(header).children(".exp-title").children(":header").length) {
                    var title = $(header).children(".exp-title").children(":header");
                    var i;
                    for (i = 0; i < title.length; i++) {
                        $(header).addClass("expanded");
                        $(header).parent().children(".exp-body").addClass("expanded");
                    }
                }
            }
        }
    });
    $(".collapse-all").click(function () {
        if ($(".mp-exp .exp-header").length) {
            var header = $(".mp-exp .exp-header");
            if ($(header).children(".exp-button").css('display') != 'none') {
                if ($(header).children(".exp-title").children(":header").length) {
                    var title = $(header).children(".exp-title").children(":header");
                    var i;
                    for (i = 0; i < title.length; i++) {
                        $(header).removeClass("expanded");
                        $(header).parent().children(".exp-body").removeClass("expanded");
                    }
                }
            }
        }
    });

    // check for bookmark and focus to it if site_type_view
    var bookmarked_id = window.location.hash.replace(/^#!?/, '');
    if (bookmarked_id && $('[data-bookmark='+bookmarked_id+']').length) {
      var bookmark_url = location.href;
      location.href = "#"+bookmarked_id;
      history.replaceState(null,null,bookmark_url);
      $("#"+bookmarked_id).click();
    }

  }
    function initMobileSections() {

        //Insert default expand messages in button for collapsed sections
        $(".section .section-header .section-button button").attr('title', messages[lang]['section-expand']);
        $(".section .section-header .section-button button").append('<span class="hide-offscreen">'+messages[lang]['section-expand']+'</span>');
        //Insert default expand messages in button for expanded sections
        $(".section .section-header.expanded .section-button button").attr('title', messages[lang]['section-collapse']);
        $(".section .section-header.expanded .section-button button .hide-offscreen").text(messages[lang]['section-collapse']);


        $(".section .section-header").click(function () {
            //toggle section
            if ($(this).children(".section-button").css('display') != 'none') {

                var head = $(this);
                var button = $(head).children(".section-button").children("button");

                if($(head).children(".section-title").children("h2").length) {
                    var title =  $(head).children(".section-title").children("h2").text();
                }
                else {
                    var title =  $(head).children(".section-title").children(".blue-label").text();
                }

                //Collapse
                if ($(head).hasClass("expanded")) {
                    //Remove expanded from section header
                    $(head).removeClass("expanded");
                    //Remove expanded from section body
                    $(head).parent().children(".section-body").removeClass("expanded");
                    //Update the live accesibility message
                    $(head).children(".sm-live-area").text(title+" "+messages[lang]['collapse']);
                    //Update the button's acessibility expanded
                    $("#"+button.attr('aria-controls')).removeAttr('aria-expanded');
                    //Update button's title and alt attributes
                    $(button).attr('title', messages[lang]['section-expand']);
                    $(button).children(".hide-offscreen").text(messages[lang]['section-expand']);

                //Expand
                } else {
                    //Add expanded to section header
                    $(head).addClass("expanded");
                    //Add expanded to section body
                    $(head).parent().children(".section-body").addClass("expanded");
                    //Update the live accesibility message
                    $(head).children(".sm-live-area").text(title+" "+messages[lang]['expand']);
                    //Update the button's acessibility expanded
                    $("#"+button.attr('aria-controls')).attr('aria-expanded', 'true');
                    //Update button's title and alt attributes
                    $(button).attr('title', messages[lang]['section-collapse']);
                    $(button).children(".hide-offscreen").text(messages[lang]['section-collapse']);
                }
            }
        });
    }
    function initSideMore() {
        /** Show/hide buttons in side sections **/
        $(".side-section button").click(function () {
            var button = $(this);
            //Collapse
            if (button.hasClass("expanded")) {
                //Remove expanded from Button
                button.removeClass("expanded");
                //Remove expanded from Area
                button.parent().children(".more-links").slideUp("fast", function () {
                    // Animation complete.
                    $(this).removeClass("expanded"); //This = more-links
                    //Update the live accesibility message
                    $(this).parent().children(".live-area").text(messages[lang]['moreless']+" "+messages[lang]['collapse']);
                    //Update the button's acessibility expanded
                    $("#"+button.attr('aria-controls')).removeAttr('aria-expanded');
                });
            //Expand
            } else {
                //Add expanded to Button
                button.addClass("expanded");
                //Add expanded to Area
                button.parent().children(".more-links").slideDown("fast", function () {
                    // Animation complete.
                    $(this).addClass("expanded"); //This = more-links
                    //Update the live accesibility message
                    $(this).parent().children(".live-area").text(messages[lang]['moreless']+" "+messages[lang]['expand']);
                    //Update the button's acessibility expanded
                    $("#"+button.attr('aria-controls')).attr('aria-expanded', 'true');
                });
            }
        });
    }
    function initListBreak() {
         // Handle line break for every 5th li(s) on the following pages:

          switch (_pid) {
          case "topic_byalpha":
          case "topic_all":
          case "flang_landing":
          case "flang_topiclist":
          case "organization":
          case "orgtopic":
          case "directory":
          case "drug-index":
          case "ency-video-index":
          case "ency-index":
          case "tpgp":
          case "health_topics_by_letter":
          case "multiple_languages_landing":
          case "multiple_languages_by_topic":
          case "organizations":
          case "organizations_by_topic":
          case "directories":
          case "drug-index":
          case "ency-video-index":
          case "ency-index":
          case "health_topics_by_group":
               $("ul li:nth-child(5n)").addClass("break");
          }
    }
    function initCategoryNavArea() {
        $(".category-nav-area").hover(function(){$(this).addClass('hovered');}, function(){$(this).removeClass('hovered');});
        $(".category-nav-area").click(function() {
            var navurl = $(this).find("a.category-nav-link").attr('href');
            if (typeof navurl !="undefined") location.assign(navurl);
        });
    }
    function initSlideShow() {

        if($(".slideshow.preview").length > 0) //Add preview wrapper div if present
        {
            $(".slideshow.preview .slide-text-info").wrap( "<div class='slide-preview'></div>" );
        }
        if($(".slideshow").length > 0)
        {
            var updateHPTimer;            // Update homepage Timer
            var nextSlideTimer;           // Slideshow Timer
            var cslid = 0;                // current slide id
            var pause_flag=false;         // play-pause toggle boolean flag

            function changeToSlide(slidebutton) {
                var which_button = $(slidebutton).attr('data-slide');
                switch (which_button) {
                case "1":
                case "2":
                case "3":
                case "4":
                    pause_flag = true;
                    var $elem = $('.slide-image');
                    var $elem_info = $('.slide-info .slide-text-info');
                    var cursid = $elem.children().eq(0).attr('data-slide');

                    if (cursid != which_button) {
                        $elem.children().eq(0)
                        .fadeOut(0)
                        .removeClass('selected')
                        .css('display','');

                        $elem.find('a[data-slide='+which_button+']')
                        .fadeIn(500)
                        .css("display","")
                        .addClass('selected');

                        $elem_info.children().eq(0)
                        .fadeOut(0)
                        .removeClass('selected')
                        .css('display','');

                        $elem_info.find('div[data-slide='+which_button+']')
                        .fadeIn(500)
                        .css("display","")
                        .addClass('selected');

                        $('.slide-info .slide-controls button[data-slide='+cursid+']')
                        .removeClass('selected').attr('aria-pressed', 'false');

                        //Accessibility message
                        $(".slideshow .live-area")
                            .text(messages[lang]['slide']+which_button+'.');

                        $('.slide-info .slide-controls button[data-slide='+which_button+']')
                        .addClass('selected').attr('aria-pressed', 'true');

                        while  (cursid != which_button) {
                            $elem.children().eq(0).next().end().appendTo($elem);
                            $elem_info.children().eq(0).next().end().appendTo($elem_info);
                            cursid = $elem.children().eq(0).attr('data-slide');
                        };
                    }
                    var pauseB = $('.slide-controls').find('button[data-slide=pause]');
                    $(pauseB).attr('data-slide','play');
                    $(pauseB).attr('title',messages[lang]['slide']);
                    $(pauseB).find('.icon').removeClass('icon-slide-pause').addClass('icon-slide-play');
                    $(pauseB).find('.hide-offscreen').html(messages[lang]['play']);
                    //pause_flag= false;  /* Click button force to pause*/

                    break;
                case "pause":
                    $(slidebutton).attr('data-slide','play');
                    $(slidebutton).attr('title',messages[lang]['play']);
                    $(slidebutton).find('.icon').removeClass('icon-slide-pause').addClass('icon-slide-play');
                    $(slidebutton).find('.hide-offscreen').html(messages[lang]['play']);
                    pause_flag = true;
                    break;
                case "play":
                    $(slidebutton).attr('data-slide','pause');
                    $(slidebutton).attr('title', messages[lang]['pause']);
                    $(slidebutton).find('.icon').removeClass('icon-slide-play').addClass('icon-slide-pause');
                    $(slidebutton).find('.hide-offscreen').html(messages[lang]['pause']);
                    pause_flag = false;
                    break;
                }

            }

            $.fn.slideShow = function(settings) {
                var config = {
                    'timeOut': 3000,
                    'speed': 'normal'
                };
                var num_of_slides = ''+$(this).find('.slide').length;

                if (settings) $.extend(config, settings);

                this.each(function() {
                    // Initialization when it got invoked
                    var $elem = $(this);
                    var $elem_info = $('.slide-info .slide-text-info');
                    $elem.children(':gt(0)').hide();
                    $elem_info.children(':gt(0)').hide();
                    $elem.children(':eq(0)').addClass('selected');
                    $elem_info.children(':eq(0)').addClass('selected');
                    $('.slide-info .slide-controls button[data-slide=1]').addClass('selected');
                    cslid = 1;

                    // Slideshow Timer event function
                    if (num_of_slides != '1') {
                        nextSlideTimer = setInterval(function() {
                            $elem = $('.slide-image');
                            $elem_info = $('.slide-info .slide-text-info');

                            if (!pause_flag) {

                                cslid = $elem.children().eq(0).attr('data-slide');

                                var nslid = (num_of_slides > 1 ? (cslid == num_of_slides ? 1 :parseInt(cslid) + 1) : 1);
                                var $curr_nav = $('.slide-info .slide-controls button[data-slide='+cslid+']');
                                var $next_nav = $('.slide-info .slide-controls button[data-slide='+nslid+']');

                                // For Slide component
                                // 1. remove 'selected' class on current slide.
                                // 2. fadeout immediately without time delay (due to
                                //    responsive design not working well with absolute/relative CSS setting.
                                // 3. next() to next slide and fadein with time delay.
                                // 4. go to end of slide and append current slide at the end
                                //    to form a proper rotation manner.
                                $elem.children().eq(0)
                                .removeClass('selected')
                                .fadeOut(0)
                                .next().fadeIn(config['speed']).css("display","")
                                .addClass('selected')
                                .end().appendTo($elem);

                                // For Slide Information component
                                // 1. remove 'selected' class on current slide information.
                                // 2. fadeout immediately without time delay (due to
                                //    responsive design not working well with absolute/relative CSS setting.
                                // 3. next() to next slide information and fadein with time delay.
                                // 4. go to end of slide information and append current slide at the end
                                //    to form a proper rotation manner.
                                $elem_info.children().eq(0)
                                .removeClass('selected')
                                .fadeOut(0)
                                .next().fadeIn(config['speed']).css("display","")
                                .addClass('selected')
                                .end().appendTo($elem_info);


                                $curr_nav.removeClass('selected').attr('aria-pressed', 'false');
                                //Accessibility message
                                $(".slideshow .live-area")
                                	.text(messages[lang]['slide']+nslid+'.');
                                $next_nav.addClass('selected').attr('aria-pressed', 'true');

                                if (nslid ==  1) {
                                    // automatically pause when rotation back to the first slide
                                    changeToSlide($(".slide-controls button[data-slide=pause]"));
                                }

                            }
                        }, config['timeOut']);
                    }
                });
            }

            // Slide controls buttons events handler
            $(".slide-controls button").click(function() {
                changeToSlide($(this));
            });

            $(".slide-controls").css("display","block");
               // Invoke slideshow with proper timeout and speed.
            $(".slide-image").slideShow({'timeOut':7000, 'speed': 1000});
        }
    }
    function initReturnToTop() {
        $(window).scroll(function() {
            $(this).scrollTop() ? $(".return-top").fadeIn() : $(".return-top").fadeOut()
        });
    }
    function initSearchClear (){
        var reset = '<button class="search-reset "type="button" alt="'+messages[lang]['clear-search']+'" title="'+messages[lang]['clear-search']+'">&#10005;</button>';

        $(window).on('load',function(){
            if ($("#searchtext_primary").val().length !=0) {
                addSearchReset();
            }
        });
        $("#searchtext_primary").keyup(function() {
            if ($("#searchtext_primary").val().length !=0) {
                addSearchReset();
            } else {
                removeSearchReset();
            }
        });
        $('#searchtext_primary').keydown(function(e){
            if (e.keyCode == 27) {
                removeSearchReset();
                $(this).val("");
            }
        });
        function addSearchReset(){
            if($("#mplus-search .search-reset").length == 0) {
                $("#searchtext_primary").after(reset);
                $(".search-reset").click(function(event) {
                    $(".search-reset").remove();
                    $("#searchtext_primary").val("");
                });
            }
        }
        function removeSearchReset(){
            $(".search-reset").remove();
        }
    }
    function initPlaceholderFix() {
        $(window).on('load',function(){
            try {
                $('input, textarea').placeholder();
            }
            catch (err) {
                //Browser is not IE8 or IE9
                //console.log(err);
            }
        });
    }
    function initDictionaryFix() {
        $('#dictionary-form input').keypress(function(e) {
                if (e.which == 13) {
                    e.preventDefault();
                    e.stopPropagation();
                    $('#dictionary-form').submit();
                }
        });
    }
    function initPageFeedback() {
        if (_pid != 'home') {
          $('#mplus-content').append('<div id="page-feedback"></div>');
          var survey_messages = {
        		'en' : {
                    'question' : "Was this page helpful?",
                    'recipe' : "Would you recommend this recipe?",
                    'low-rating': "No",
                    'high-rating': "Yes",
                    'thank-you': "Thank you for your feedback!",
                    'omb-approval': "Form Approved OMB# 0000-0000 Exp. Date 9/30/2020"
        		},
        		'es' : {
                    'question' : "¿Le ayudó esta página?",
                    'recipe' : "¿Recomendaría esta receta?",
                    'low-rating': "No",
                    'high-rating': "Sí",
                    'thank-you': "¡Gracias por su respuesta!",
                    'omb-approval': "Form Approved OMB# 0000-0000 Exp. Date 9/30/2020"
        		}
          }
          var feedback_heading = survey_messages[lang]['question'];
          if (_pid == 'recipe') {
            feedback_heading = survey_messages[lang]['recipe'];
          }
          $('#page-feedback').append(
            '<h2 class="feedback-question">'+feedback_heading+'</h2>'
            +'<div class="feedback-survey">'
            +'<div class="rating" data-rated="false">'
            +'<div class="rating-buttons">'
            +'<button class="feedback-rate" data-rate="5"><span>'+survey_messages[lang]['high-rating']+'</span></button>'
            +'<button class="feedback-rate" data-rate="1"><span>'+survey_messages[lang]['low-rating']+'</span></button>'
            +'</div>'
            +'</div>'
            +'<div class="rated-label">'+survey_messages[lang]['thank-you']+'</div>'
            +'</div>'
            // +'<a class="feedback-approval "href="#">'+survey_messages[lang]['omb-approval']+'</a>'
          );

          $( ".feedback-rate" ).click(function() {
            var rate = $(this).data("rate");
            $(".rating").data("rated", true);

            // Check for additional feedback
            if ( $('.QSI__EmbeddedFeedbackContainer').length) {
              // Enter rating data
              if(rate == '1') { // rated no
                $('.QSI__EmbeddedFeedbackContainer_TextButton:nth-child(2)').trigger('click');
              }
              else { // rated yes
                $('.QSI__EmbeddedFeedbackContainer_TextButton:nth-child(1)').trigger('click');
              }
            }

            $( ".rating" ).fadeOut( "slow", function() {
              $( ".rated-label" ).fadeIn( "slow").promise().done(function() {
                // Unhide additional feedback
                $('#page-feedback').addClass("rated");
              });
            });
          
          });
        }
    }
    function initSurveryDisclaimer() {
        if (typeof display_survey_disclaimer !== 'undefined' && display_survey_disclaimer) {
          if (_pid == "article" || _pid == "carepoint") {
              $('#mplus-footer').before('<div class="survey-disclaimer"></div>')
          }
          else {
              $('#mplus-content').append('<div class="survey-disclaimer"></div>')
          }
          $('.survey-disclaimer').append(
              '<h2>Page Survey</h2>'
              +'<span>OMB Control Number: 0925-0648. Expiration Date: March 31, 2018</span>'
              +'<p>Public reporting burden for this collection of information is '
              +'estimated to average 1 minute per response, including the time '
              +'for reviewing instructions, searching existing data sources, '
              +'gathering and maintaining the data needed, and completing and '
              +'reviewing the collection of information. An agency may not '
              +'conduct or sponsor, and a person is not required to respond '
              +'to, a collection of information unless it displays a currently '
              +'valid OMB control number. Send comments regarding this burden '
              +'estimate or any other aspect of this collection of '
              +'information, including suggestions for reducing this burden, '
              +'to: NIH, Project Clearance Branch, 6705 Rockledge Drive, MSC '
              +'7974, Bethesda, MD 20892-7974, ATTN: PRA (0925-0648). Do not '
              +'return the completed form to this address.</p>'
          );
        }
    }
    function initGovDSubmit() {
      $(".gov-delivery").append('<input type="hidden" name="subscription_type" value="email"/>');
      $(".gov-delivery").append('<input type="hidden" name="phone" value=""/>');
      $(".gov-delivery").submit(function(e){
        var email_input = $(this).find("input[name='email']").val();
        $(this).find("input[name='phone']").val(email_input);
        // if email input is a phone number, set sub type to phone
        if (/^[0-9\- \)\(\+\/\.]+$/.test(email_input)) {
          $(this).find("input[name='subscription_type']").val("phone");
        } else {
          $(this).find("input[name='subscription_type']").val("email");
        }
     });
    }
    function initVideoJumpLinks() {
      var videojs_video = $('.video-container div').attr('id');
      if (videojs_video) {
        // Check for initial time hash
        try {
          var timeParam = window.location.hash.split('#')[1].split('=');
          timeParam.shift();
        } catch(err) {}

        // init jump links
        $("a[href^='#t=']").click(function() {
            $('video')[0].play();
     	   $('video')[0].currentTime = $(this).attr('href').substr(3);
     	   document.getElementById("mplusPlayer").scrollIntoView();
     	   document.getElementById("mplusPlayer").focus();

        });
      }
    }

    function initImageModals() {
      // Control functions
      function modalClose(anchor, modal) {
        $('#mplus-wrap :focusable, #'+modal.attr('id')+' :focusable').removeAttr('tabindex');
        $('[role="button"]').attr('tabindex', '0');
        modal.hide();
        $(anchor).focus();
        $("body").removeClass("modal-open");
      }
      function modalOpen(anchor, modal) {
        modal.show();
        $(".modal-background").click(function(e) {
          modalClose(anchor, modal);
        });
        $(".modal-close").focus();
        $('#'+modal.attr('id')+' :focusable').attr('tabindex', '1');
        $('#mplus-wrap :focusable').attr('tabindex', '-1');
        $( document ).on( 'keydown', function ( e ) {
          if ( e.keyCode === 27 ) { // ESC
            modalClose(anchor, modal);
          }
        });
        $("body").addClass("modal-open");
      }

      // Prepare modals for each anchor element with class 'image-modal'
      $('.image-modal').each(function( index ) {
        var file_path = _root + $(this).data('filepath');
        // console.log('fp', file_path);
        var caption = $(this).data('caption');
        if (caption.length > 0) {
          caption = '<p class="modal-card-caption">' + caption + '</p>'
        }
        var credit = $(this).data('credit');
        var sourceurl = $(this).data('sourceurl');
        if (credit.length > 0) {
          var credit_label = '';
          if (lang == 'es'){
            credit_label = 'Crédito';
          } else {
            credit_label = 'Credit';
          }
          if (sourceurl.length > 0) {
            credit = '<p style="margin:0;">'+credit_label+': <a href="'+sourceurl+'" target="_blank">'+credit+'</a></p>'
          } else {
            credit = '<p style="margin:0;">'+credit_label+': '+credit+'</p>'
          }
        }
        var image_id = $(this).attr('id');
        var title = $(this).data('title')
        if (title.length < 1) {
          title = $(this).html()
          var title_array = title.split('<');
          title_array = title_array[0].split(' ');
          // console.log(title_array)
          title = '';
          for(var i = 0; i < title_array.length; i++) {
            title += title_array[i].charAt(0).toUpperCase() + title_array[i].slice(1) + ' ';
          }
          
        }
        var alt = $(this).data('alt');
        if (alt.length < 1) {
          alt = 'An image depicting ' + title
        }
        var terms_of_use = '';
        var tou_link = '';
        if (lang == 'es') {
          terms_of_use = 'Uso de ilustraciones y otros contenidos';
          tou_link = 'https://medlineplus.gov/spanish/acercade/uso/usodecontenido/'
        } else {
          terms_of_use = 'Use of illustrations and other content';
          tou_link = 'https://medlineplus.gov/about/using/usingcontent/'
        }
        $('body').append(
          '<div id="image-modal-'+image_id+'" class="modal">' +
            // '<div id="modal-background-'+image_id+'" class="modal-background"></div>' +
            '<div class="modal-card">' +
              '<header class="modal-card-head">' +
                '<button id="modal-close-'+image_id+'" class="modal-close" role="button" title="Close Image" aria-label="Close Image"><span aria-hidden="true">X</span></button>' +
                '<p class="modal-card-title">'+title+'</p>' +
              '</header>' +
              '<section class="modal-card-body">' +
                '<img class="modal-card-img" src="'+file_path+'" alt="'+alt+'">' +
                ''+caption+'' +
              '</section>' +
              '<section class="modal-card-foot">' +
                ''+credit+'' +
                '<p style="margin:0;"><a href="'+tou_link+'" target="_blank">'+terms_of_use+'</a></p>' +
              '</section>' +
            '</div>' +
          '</div>'
        );
        var anchor = $(this)
        var modal = $('#image-modal-'+image_id);
        var close_btn = $('#modal-close-'+image_id);
        close_btn.click(function(e) {
          modalClose(anchor, modal);
          e.preventDefault();
        });
        modal.click(function(e) {
          // console.log('event target: ', e.target.id, modal.attr('id'));
          if (e.target.id == modal.attr('id')) {
            modalClose(anchor, modal);
            e.preventDefault();
          }
        });
        $(this).click(function(e) {
          modalOpen(anchor, modal);
          e.preventDefault();
        });
      });
    }

})(jQuery);
