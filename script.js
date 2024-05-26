class JReffed {
    constructor(jRef) {
        this.jRef = jRef;
    }
}

class Link extends JReffed {
    constructor(jRef, start, end) {
        super(jRef);
        this.tag = "link";
        this.start = start;
        this.end = end;
        this.text = "";
    }
}

class Node extends JReffed {
    constructor(jRef, cx, cy) {
        super(jRef);
        this.cx = cx;
        this.cy = cy;
    }
}

class DecisionNode extends Node {
    constructor(jRef, cx, cy) {
        super(jRef, cx, cy);
        this.tag = "decision";
        this.incomingLinks = new Set();
        this.choices = new Set();
    }
}
class ChoiceNode extends Node {
    constructor(jRef, cx, cy) {
        super(jRef, cx, cy);
        this.tag = "choice";
        this.id = "";
        this.text = "";
        this.outgoingLink = "";
    }
}

$(document).ready(function () {
    let textarea = document.querySelector("#fileContents");

    /* textarea.addEventListener("sl-change", function () {
        createFromText(textarea.value);
    }); */

    textarea.addEventListener("sl-focus", function () {
        inputtingText = true;
    });

    textarea.addEventListener("sl-blur", function () {
        inputtingText = false;
    });

    const weight = 100;
    const maxDistance = 200;
    //const mouseProximity = 1000;
    const deltaDeadzone = 0.01;
    const decisionMinRadius = 40;
    const grabThreshold = 100;
    let bucketSize = 200;

    let inputtingText = false;

    let start, previousTimeStamp;

    let spatialBuckets = {};
    let awakeLinks = [];
    let interactive = $("#interactive");

    let mouseX = 0;
    let mouseY = 0;

    let nodeObjs = {};
    let linkObjs = {};

    let prospectiveMerge = null;

    let hoveredObj = null;

    let grabTimeout;

    const getOGWidth = function () {
        let viewBox = interactive.attr("viewBox");
        let coords = viewBox.split(" ");
        return parseFloat(coords[2]);
    };

    let ogWidth = getOGWidth();
    let scale = 1;

    interactive.on("mousemove", function (event) {
        mouseX = event.clientX;
        mouseY = event.clientY;

        $("#tooltip").css(
            "transform",
            `translate(${+mouseX + 10}px, ${+mouseY + 10}px)`
        );

        $(".clicked").each(function () {
            $(this).addClass("grabbed");
            $(this).removeClass("clicked");
        });

        if ($(".grabbed").length) {
            let [dx, dy] = $(".grabbed").data("mouseDelta");

            let [selfX, selfY] = [mouseX * scale + dx, mouseY * scale + dy];

            let uuid = $(".grabbed").data("uuid");
            nodeObjs[uuid].cx = selfX;
            nodeObjs[uuid].cy = selfY;

            if (nodeObjs[uuid].tag === "decision") {
                $(".grabbed").attr("cx", nodeObjs[uuid].cx);
                $(".grabbed").attr("cy", nodeObjs[uuid].cy);
            }

            $(".grabbed").removeClass("mergeable");
            prospectiveMerge = null;

            const awakeGrabbables = spatialBuckets[coordHash(selfX, selfY)];

            if (awakeGrabbables) {
                for (let index = 0; index < awakeGrabbables.length; index++) {
                    let endObj = awakeGrabbables[index];
                    let endID = endObj.data("uuid");
                    let mergeProximity = parseFloat(endObj.attr("r"));
                    // check for endObj having uuid as choice
                    endObj.removeClass("mergeable");
                    let dx = selfX - nodeObjs[endID].cx;
                    let dy = selfY - nodeObjs[endID].cy;
                    let distanceSqr = dx * dx + dy * dy;
                    if (
                        distanceSqr <= +mergeProximity * +mergeProximity &&
                        !endObj.hasClass("grabbed") &&
                        $(".grabbed.choiceNode").length
                    ) {
                        let startID = $(".grabbed.choiceNode").data("uuid");
                        let startObjLink = nodeObjs[startID].outgoingLink; // uuid of link
                        let endObjLinks = nodeObjs[endID].incomingLinks; // uuids of links
                        //console.log(existingLinks);
                        let linkExists =
                            startObjLink != "" ||
                            nodeObjs[endID].choices.has(startID);
                        if (!linkExists) {
                            for (const linkID of endObjLinks) {
                                if (startObjLink === linkID) {
                                    linkExists = true;
                                    break;
                                }
                            }
                        }

                        if (!linkExists) {
                            endObj.addClass("mergeable");
                            $(".grabbed").addClass("mergeable");
                            prospectiveMerge = endObj;
                            break;
                        }
                    }
                }
            }
        } else if (interactive.data("panning")) {
            let [mx, my] = $(this).data("mousePos");
            let dx = (mouseX - mx) * scale;
            let dy = (mouseY - my) * scale;

            let viewBox = $(this).attr("viewBox");
            let coords = viewBox.split(" ");

            let cx = parseFloat(coords[0]);
            let cy = parseFloat(coords[1]);
            let width = coords[2];
            let height = coords[3];

            $(this).attr(
                "viewBox",
                `${+cx - +dx} ${+cy - +dy} ${width} ${height}`
            );
        }

        $(this).data("mousePos", [mouseX, mouseY]);
    });

    interactive.on("mousedown", function () {
        interactive.data("panning", true);
    });

    interactive.on("mouseup", function () {
        interactive.data("panning", false);
    });

    $(window).on("click", function () {
        if (
            hoveredObj &&
            hoveredObj.hasClass("link") &&
            !hoveredObj.hasClass("beingViewed")
        ) {
            hoveredObj.addClass("beingViewed");
            let uuid = hoveredObj.data("uuid");
            let link = linkObjs[uuid];
            let textInput = document.createElement("sl-textarea");
            textInput.label = "Description";
            textInput.value = link.text;
            textInput.addEventListener("sl-input", function (event) {
                link.text = event.target.value;
            });
            $("#nodeViewer").html("").append(textInput);
            document.querySelector("#nodeViewer").label = "Link";
            document
                .querySelector("#nodeViewer")
                .addEventListener("sl-after-hide", function () {
                    hoveredObj.removeClass("beingViewed");
                });
            document.querySelector("#nodeViewer").show();
        }
    });

    $(window).keyup(function (event) {
        let viewBox = interactive.attr("viewBox");
        let coords = viewBox.split(" ");

        let minX = parseFloat(coords[0]);
        let minY = parseFloat(coords[1]);

        let uuid = crypto.randomUUID();

        switch (event.key) {
            case "D":
                //console.log("new circle");
                let circle = SVG("circle");
                $(circle).attr({
                    class: "grabbable",
                    cx: minX + mouseX * scale,
                    cy: minY + mouseY * scale,
                    r: 40,
                    stroke: "black",
                    "stroke-width": 4,
                    fill: "white",
                });

                $(circle).data("uuid", uuid);
                nodeObjs[uuid] = new DecisionNode(
                    $(circle),
                    minX + mouseX * scale,
                    minY + mouseY * scale
                );

                interactive.append(circle);
                createGrabbable();
                event.preventDefault();
                break;
            case "C":
                if (hoveredObj) {
                    let choice = SVG("polygon");
                    $(choice).attr({
                        class: "choiceNode grabbable",
                        points: constructPolygon(
                            minX + mouseX * scale,
                            minY + mouseY * scale,
                            0,
                            20,
                            3
                        ),
                        stroke: "black",
                        "stroke-width": 3,
                        fill: "white",
                    });

                    $(choice).data("uuid", uuid);

                    let hoveredID = hoveredObj.data("uuid");

                    if (
                        nodeObjs[hoveredID].tag === "decision" &&
                        !hoveredObj.hasClass("grabbed")
                    ) {
                        let decisionNode = nodeObjs[hoveredID];
                        nodeObjs[uuid] = new ChoiceNode(
                            $(choice),
                            minX + mouseX * scale,
                            minY + mouseY * scale
                        );
                        decisionNode.choices.add(uuid);
                        interactive.append(choice);
                        createGrabbable();
                    }
                }

                event.preventDefault();
                break;
            /* case "E":
                $(".hovered.choiceNode").each(function () {
                    let objToEdit = nodeObjs[$(this).data("uuid")];
                    let id = prompt(
                        "Edit id",
                        objToEdit.id ? objToEdit.id : ""
                    );
                    objToEdit.id = id;
                });
                break; */
            default:
                break;
        }
    });

    interactive.on("wheel", function (event) {
        let scroll = event.originalEvent.wheelDelta;
        let viewBox = $(this).attr("viewBox");
        let coords = viewBox.split(" ");

        let cx = parseFloat(coords[0]);
        let cy = parseFloat(coords[1]);
        let width = parseFloat(coords[2]);
        let height = parseFloat(coords[3]);

        let aspect = height / width;

        let newWidth = Math.max(1, +width - +scroll);
        let newHeight = aspect * newWidth;

        let dw = (+newWidth - +width) / 2;
        let dh = (+newHeight - +height) / 2;

        scale = newWidth / ogWidth;

        $(this).attr(
            "viewBox",
            `${+cx - +dw} ${+cy - +dh} ${newWidth} ${newHeight}`
        );
        event.preventDefault();
    });

    const createGrabbable = function () {
        $(".grabbable").on("mousedown", function (event) {
            let uuid = $(this).data("uuid");
            let mx = event.clientX;
            let my = event.clientY;
            let cx = nodeObjs[uuid].cx;
            let cy = nodeObjs[uuid].cy;

            let dx = cx - mx * scale;
            let dy = cy - my * scale;

            $(this).data("mouseDelta", [dx, dy]);
            $(this).data("clickStart", Date.now());
            $(this).addClass("clicked");
            grabTimeout = setTimeout(function () {
                $(".clicked").each(function () {
                    $(this).addClass("grabbed");
                    $(this).removeClass("clicked");
                });
            }, grabThreshold);
            $(this).parent().append($(this));
        });

        $(".grabbable").on("mouseup", function (event) {
            let clickStart = $(this).data("clickStart");
            if (Date.now() - clickStart < grabThreshold) {
                clearTimeout(grabTimeout);
                $(this).removeClass("clicked");
                let uuid = $(this).data("uuid");
                if (nodeObjs[uuid].tag === "choice") {
                    let choice = nodeObjs[uuid];
                    console.log(choice);
                    let idInput = document.createElement("sl-input");
                    idInput.label = "ID";
                    idInput.value = choice.id;
                    idInput.addEventListener("sl-input", function (event) {
                        choice.id = event.target.value;
                    });
                    let textInput = document.createElement("sl-input");
                    textInput.label = "Text";
                    textInput.value = choice.text;
                    textInput.addEventListener("sl-input", function (event) {
                        choice.text = event.target.value;
                    });
                    $("#nodeViewer").html("").append(idInput).append(textInput);
                    document.querySelector("#nodeViewer").label = "Choice";
                    document.querySelector("#nodeViewer").show();
                }
            } else if ($(this).hasClass("grabbed")) {
                if (prospectiveMerge) {
                    let endObj = prospectiveMerge;
                    let endID = endObj.data("uuid");
                    let startID = $(this).data("uuid");
                    //console.log("new link");
                    let link = SVG("path");
                    $(link).attr({
                        class: "link",
                        d: constructLine(
                            nodeObjs[endID].cx,
                            nodeObjs[endID].cy,
                            nodeObjs[startID].cx,
                            nodeObjs[startID].cy
                        ),
                        stroke: "black",
                        fill: "transparent",
                        "stroke-width": 4,
                    });
                    let uuid = crypto.randomUUID();
                    $(link).data("uuid", uuid);
                    linkObjs[uuid] = new Link($(link), startID, endID);
                    //$(link).data("nodes", { start: startID, end: endID });
                    interactive.append(link);

                    nodeObjs[startID].outgoingLink = uuid;
                    nodeObjs[endID].incomingLinks.add(uuid);

                    endObj.removeClass("mergeable");
                    $(this).removeClass("mergeable");

                    /* let group = SVG("g");
                    group.prepend(link);
                    //$(group).append(endObj);
                    $(group).append($(this));
                    interactive.append(group); */

                    $(link).on("mouseenter", function (event) {
                        $(this).addClass("hovered");
                        hoveredObj = $(this);
                    });

                    $(link).on("mouseleave", function (event) {
                        $(this).removeClass("hovered");
                        if (
                            hoveredObj &&
                            hoveredObj.data("uuid") == $(this).data("uuid")
                        ) {
                            hoveredObj = null;
                        }
                    });
                }
            }
            $(this).removeClass("grabbed");
        });

        $(".grabbable").on("mouseenter", function (event) {
            $(this).addClass("hovered");
            hoveredObj = $(this);
            let choiceId = nodeObjs[$(this).data("uuid")].id;
            if (choiceId) {
                $("#tooltip").text(choiceId);
                $("#tooltip").show();
            }
        });

        $(".grabbable").on("mouseleave", function (event) {
            $(this).removeClass("hovered");
            if (hoveredObj && hoveredObj.data("uuid") == $(this).data("uuid")) {
                hoveredObj = null;
            }
            $("#tooltip").hide();
        });
    };

    const SVG = function (elementName) {
        return document.createElementNS(
            "http://www.w3.org/2000/svg",
            elementName
        );
    };

    const coordHash = function (x, y) {
        return `${Math.floor(+x / bucketSize)},${Math.floor(+y / bucketSize)}`;
    };

    const broadPhase = function () {
        console.log(bucketSize);
        spatialBuckets = {};
        awakeLinks = [];
        $(".grabbable").each(function () {
            let uuid = $(this).data("uuid");
            if (nodeObjs[uuid].tag === "decision") {
                let [selfX, selfY] = [nodeObjs[uuid].cx, nodeObjs[uuid].cy];
                if (!$(this).hasClass("grabbed")) {
                    $(this).attr("cx", selfX).attr("cy", selfY);
                    let hash = coordHash(selfX, selfY);
                    if (spatialBuckets[hash]) {
                        spatialBuckets[hash].push($(this));
                    } else {
                        spatialBuckets[hash] = [$(this)];
                    }
                }
            }
        });
    };

    const narrowPhase = function (deltaTime) {
        for (const hash in spatialBuckets) {
            let [hashX, hashY] = hash.split(",", 2);
            let awakeGrabbables = [];
            //console.log(hash);
            for (let x = -1; x <= 1; x++) {
                for (let y = -1; y <= 1; y++) {
                    const bucketHash = `${parseInt(hashX) + x},${
                        parseInt(hashY) + y
                    }`;
                    if (spatialBuckets[bucketHash]) {
                        //console.log(spatialBuckets[bucketHash]);
                        awakeGrabbables = awakeGrabbables.concat(
                            spatialBuckets[bucketHash]
                        );
                    }
                }
            }
            //console.log(awakeGrabbables);

            for (let index = 0; index < awakeGrabbables.length; index++) {
                let initObj = awakeGrabbables[index];
                let initID = initObj.data("uuid");
                let initCurrentPos = [nodeObjs[initID].cx, nodeObjs[initID].cy];
                for (
                    let indexTwo = 0;
                    indexTwo < awakeGrabbables.length;
                    indexTwo++
                ) {
                    if (indexTwo == index) {
                        continue;
                    }
                    let compareObj = awakeGrabbables[indexTwo];
                    let compareID = compareObj.data("uuid");
                    let compareCurrentPos = [
                        nodeObjs[compareID].cx,
                        nodeObjs[compareID].cy,
                    ];

                    let repelX = initCurrentPos[0] - compareCurrentPos[0];
                    let repelY = initCurrentPos[1] - compareCurrentPos[1];

                    if (repelX == 0 && repelY == 0) {
                        repelX = Math.random() * 0.02 - 0.01;
                        repelY = Math.random() * 0.02 - 0.01;
                    }

                    let distanceSqr = Math.max(
                        1,
                        repelX * repelX + repelY * repelY
                    );

                    const initObjRadiusMultiplier =
                        parseFloat(initObj.attr("r")) / 40;

                    const compareObjRadiusMultiplier =
                        parseFloat(compareObj.attr("r")) / 40;

                    const averageRadiusMultiplier = Math.sqrt(
                        initObjRadiusMultiplier * compareObjRadiusMultiplier
                    );

                    bucketSize = Math.max(
                        bucketSize,
                        maxDistance * averageRadiusMultiplier
                    );

                    //console.log("distanceSqr: ", distanceSqr);
                    if (
                        distanceSqr <=
                        maxDistance *
                            initObjRadiusMultiplier *
                            maxDistance *
                            compareObjRadiusMultiplier
                    ) {
                        let distance = Math.sqrt(distanceSqr);

                        let multiplier = deadzone(
                            1 -
                                smoothstep(
                                    distance /
                                        (maxDistance * averageRadiusMultiplier)
                                )
                        );

                        //console.log("distanceSqr: ", distanceSqr);

                        let normalX = repelX / distance;
                        let normalY = repelY / distance;

                        //console.log("repelVec: ", normalX, normalY);

                        let vecX =
                            (multiplier * deltaTime * normalX) / distanceSqr;
                        let vecY =
                            (multiplier * deltaTime * normalY) / distanceSqr;
                        //console.log("init:", initCurrentPos[0], initCurrentPos[1], "vec: ", vecX, vecY);
                        nodeObjs[initID].cx =
                            parseFloat(initCurrentPos[0]) +
                            (clamp(-5, 5, weight * weight * vecX) *
                                initObjRadiusMultiplier *
                                compareObjRadiusMultiplier) /
                                2;
                        nodeObjs[initID].cy =
                            parseFloat(initCurrentPos[1]) +
                            (clamp(-5, 5, weight * weight * vecY) *
                                initObjRadiusMultiplier *
                                compareObjRadiusMultiplier) /
                                2;

                        nodeObjs[compareID].cx =
                            parseFloat(compareCurrentPos[0]) -
                            (clamp(-5, 5, weight * weight * vecX) *
                                initObjRadiusMultiplier *
                                compareObjRadiusMultiplier) /
                                2;
                        nodeObjs[compareID].cy =
                            parseFloat(compareCurrentPos[1]) -
                            (clamp(-5, 5, weight * weight * vecY) *
                                initObjRadiusMultiplier *
                                compareObjRadiusMultiplier) /
                                2;

                        if (multiplier > 0.0) {
                            awakeLinks.push(
                                ...Array.from(nodeObjs[initID].incomingLinks)
                            );
                            /* awakeLinks.push(
                                ...Array.from(nodeObjs[compareID].incomingLinks)
                            ); */
                        }
                    }

                    /* compareObj.attr("cx", nodeObjs[compareID].cx);
                    compareObj.attr("cy", nodeObjs[compareID].cy); */
                }

                /* initObj.attr("cx", nodeObjs[initID].cx);
                initObj.attr("cy", nodeObjs[initID].cy); */
            }
        }
    };

    const clamp = function (min, max, value) {
        return Math.max(min, Math.min(max, value));
    };

    const deadzone = function (value) {
        if (Math.abs(value) <= deltaDeadzone) {
            return 0;
        }
        return value;
    };

    const smoothstep = function (t, min = 0, max = 1) {
        var x = Math.max(0, Math.min(1, (t - min) / (max - min)));
        return x * x * (3 - 2 * x);
    };

    const constructLine = function (x1, y1, x2, y2) {
        return `M ${x1} ${y1} L ${x2} ${y2}`;
    };

    const constructPolygon = function (cx, cy, theta, radius, points) {
        let angleStep = (2 * Math.PI) / +points;
        let string = "";

        for (let point = 0; point < points; point++) {
            let angle = angleStep * point + +theta;
            let ox = +radius * Math.cos(angle);
            let oy = +radius * Math.sin(angle);

            string += `${+cx + +ox},${+cy + +oy} `;
        }

        string = string.trimEnd();

        return string;
    };

    const updatePaths = function () {
        let awakeLinkSet = new Set(awakeLinks);
        awakeLinkSet.delete("");
        awakeLinks = [...awakeLinkSet];

        let viewBox = interactive.attr("viewBox");
        let coords = viewBox.split(" ");

        let cx = parseFloat(coords[0]);
        let cy = parseFloat(coords[1]);

        for (let link = 0; link < awakeLinks.length; link++) {
            let uuid = awakeLinks[link];
            let linkObj = linkObjs[uuid];
            let linkObjJref = linkObj.jRef;
            let startObj = nodeObjs[linkObj.start].jRef;
            let endObj = nodeObjs[linkObj.end].jRef;

            let startR = 20;
            let endR = endObj.attr("r");

            let [startX, startY] = [
                nodeObjs[linkObj.start].cx,
                nodeObjs[linkObj.start].cy,
            ];
            let [endX, endY] = [
                nodeObjs[linkObj.end].cx,
                nodeObjs[linkObj.end].cy,
            ];

            let [dx, dy] = [+endX - +startX, +endY - +startY];

            let length = Math.sqrt(+dx * +dx + +dy * +dy);

            let [normalX, normalY] = [+dx / +length, +dy / +length];

            const linkStartX = +startX + +normalX * +startR;
            const linkStartY = +startY + +normalY * +startR;
            const linkEndX = +endX - +normalX * +endR;
            const linkEndY = +endY - +normalY * +endR;

            linkObjJref.attr(
                "d",
                constructLine(linkStartX, linkStartY, linkEndX, linkEndY)
            );

            if (
                hoveredObj == null ||
                hoveredObj.data("uuid") == linkObjJref.data("uuid")
            ) {
                const bax = (linkEndX - cx - (linkStartX - cx)) / scale;
                const bay = (linkEndY - cy - (linkStartY - cy)) / scale;

                const pax = mouseX - (linkStartX - cx) / scale;
                const pay = mouseY - (linkStartY - cy) / scale;

                const paOba = bax * pax + bay * pay;
                const baOba = bax * bax + bay * bay;

                const h = clamp(0, 1, paOba / baOba);

                const dX = pax - h * bax;
                const dY = pay - h * bay;

                const distanceToMouse = Math.sqrt(dX * dX + dY * dY);

                //console.log(hoveredObj);

                if (distanceToMouse <= 20) {
                    linkObjJref.addClass("hovered");
                    hoveredObj = linkObjJref;
                } else if (
                    hoveredObj &&
                    hoveredObj.data("uuid") == linkObjJref.data("uuid")
                ) {
                    linkObjJref.removeClass("hovered");
                    hoveredObj = null;
                } else {
                    linkObjJref.removeClass("hovered");
                }
            } else {
                linkObjJref.removeClass("hovered");
            }

            interactive.append(linkObjJref);
        }
    };

    const separation = 50;

    const updateChildren = function (grabbable) {
        let grabbableUuid = grabbable.data("uuid");
        let cx = nodeObjs[grabbableUuid].cx;
        let cy = nodeObjs[grabbableUuid].cy;

        let choices = nodeObjs[grabbableUuid].choices;
        //console.log(choices);
        if (choices.size > 0) {
            let radius =
                choices.size > 1
                    ? separation / (2 * Math.sin(Math.PI / choices.size))
                    : 0;
            let angleStep = (2 * Math.PI) / choices.size;

            grabbable.attr(
                "r",
                Math.max(decisionMinRadius, radius + separation)
            );

            let averageDeltaTheta = grabbable.data("angle")
                ? parseFloat(grabbable.data("angle"))
                : 0;

            //let averageDeltaTheta = 0;
            let childrenWithLinks = 0;

            for (let child = 0; child < choices.size; child++) {
                /* let angle = angleStep * child;
                let ox = radius * Math.cos(angle);
                let oy = radius * Math.sin(angle); */
                let choiceID = Array.from(choices)[child];
                let choiceJRef = nodeObjs[choiceID].jRef;
                let outgoingLink =
                    nodeObjs[Array.from(choices)[child]].outgoingLink;

                if (!choiceJRef.hasClass("grabbed") && outgoingLink) {
                    childrenWithLinks++;

                    /* let vLength = Math.sqrt(v1 * v1 + v2 * v2);
                    let wLength = Math.sqrt(w1 * w1 + w2 * w2); */

                    // let thetaChoice = Math.atan2(ccx - cx, ccy - cy);
                    let linkObj = linkObjs[outgoingLink];

                    let ccx = parseFloat(nodeObjs[choiceID].cx);
                    let ccy = parseFloat(nodeObjs[choiceID].cy);
                    let dcx = parseFloat(nodeObjs[linkObj.end].cx);
                    let dcy = parseFloat(nodeObjs[linkObj.end].cy);

                    let v1 = ccx - cx;
                    let v2 = ccy - cy;
                    let w1 = dcx - cx;
                    let w2 = dcy - cy;

                    // let thetaLinkedDecision = ;
                    choiceJRef.data(
                        "angle",
                        Math.PI / 2 - Math.atan2(dcx - ccx, dcy - ccy)
                    );

                    averageDeltaTheta += Math.atan2(
                        w2 * v1 - w1 * v2,
                        w1 * v1 + w2 * v2
                    ); //thetaLinkedDecision - thetaChoice;
                    //averageDeltaTheta += thetaChoice - thetaLinkedDecision;
                }
            }

            grabbable.data("angle", averageDeltaTheta);

            for (let child = 0; child < choices.size; child++) {
                let angle =
                    angleStep * child +
                    (childrenWithLinks > 0
                        ? averageDeltaTheta / childrenWithLinks
                        : 0);
                let ox = +radius * Math.cos(angle);
                let oy = +radius * Math.sin(angle);
                let choiceID = Array.from(choices)[child];
                let choiceJRef = nodeObjs[choiceID].jRef;
                let outgoingLink =
                    nodeObjs[Array.from(choices)[child]].outgoingLink;

                if (outgoingLink) {
                    awakeLinks.push(
                        nodeObjs[Array.from(choices)[child]].outgoingLink
                    );
                } else {
                    choiceJRef.data("angle", angle);
                }

                if (!choiceJRef.hasClass("grabbed")) {
                    nodeObjs[choiceID].cx = +cx + +ox;
                    nodeObjs[choiceID].cy = +cy + +oy;
                    choiceJRef.parent().append(choiceJRef);
                }

                if (hoveredObj == choiceJRef) {
                    let distanceToMouse = Math.sqrt(
                        (mouseX - nodeObjs[choiceID].cx) *
                            (mouseX - nodeObjs[choiceID].cx) +
                            (mouseY - nodeObjs[choiceID].cy) *
                                (mouseY - nodeObjs[choiceID].cy)
                    );
                    if (distanceToMouse > 20) {
                        choiceJRef.removeClass("hovered");
                        hoveredObj = null;
                    }
                } else {
                    choiceJRef.removeClass("hovered");
                }

                choiceJRef.attr(
                    "points",
                    constructPolygon(
                        nodeObjs[choiceID].cx,
                        nodeObjs[choiceID].cy,
                        parseFloat(choiceJRef.data("angle")),
                        20,
                        3
                    )
                );
            }
        }
    };

    const updateChoices = function () {
        /* for (let index = 0; index < awakeGrabbables.length; index++) {
            let grabbable = awakeGrabbables[index];
            updateChildren(grabbable);
        } */

        $(".grabbable:not(.choiceNode)").each(function () {
            let grabbable = $(this);
            updateChildren(grabbable);
        });

        $(".grabbed:not(.choiceNode)").each(function () {
            let grabbable = $(this);
            updateChildren(grabbable);
        });
    };

    const jsonCleaner = function (key, value) {
        if (key === "jRef") {
            return undefined;
        }

        if (value instanceof Set) {
            return Array.from(value);
        }
        return value;
    };

    const createFromText = function (json) {
        nodeObjs = {};
        linkObjs = {};
        let contentsObj = JSON.parse(json);

        for (const uuid in contentsObj.nodes) {
            let tag = contentsObj.nodes[uuid].tag;
            switch (tag) {
                case "decision":
                    let circle = SVG("circle");
                    $(circle).attr({
                        class: "grabbable",
                        cx: contentsObj.nodes[uuid].cx,
                        cy: contentsObj.nodes[uuid].cy,
                        r: 40,
                        stroke: "black",
                        "stroke-width": 4,
                        fill: "white",
                    });

                    $(circle).data("uuid", uuid);
                    nodeObjs[uuid] = contentsObj.nodes[uuid];
                    nodeObjs[uuid].choices = new Set(nodeObjs[uuid].choices);
                    nodeObjs[uuid].incomingLinks = new Set(
                        nodeObjs[uuid].incomingLinks
                    );
                    nodeObjs[uuid].jRef = $(circle);

                    interactive.append(circle);
                    createGrabbable();
                    break;
                case "choice":
                    let choice = SVG("polygon");
                    $(choice).attr({
                        class: "choiceNode grabbable",
                        points: constructPolygon(
                            contentsObj.nodes[uuid].cx,
                            contentsObj.nodes[uuid].cy,
                            0,
                            20,
                            3
                        ),
                        stroke: "black",
                        "stroke-width": 3,
                        fill: "white",
                    });

                    $(choice).data("uuid", uuid);

                    nodeObjs[uuid] = contentsObj.nodes[uuid];
                    nodeObjs[uuid].jRef = $(choice);
                    interactive.append(choice);
                    createGrabbable();
                    break;
            }
        }

        for (const uuid in contentsObj.links) {
            let link = SVG("path");
            $(link).attr({
                class: "link",
                d: "",
                stroke: "black",
                fill: "transparent",
                "stroke-width": 4,
            });
            $(link).data("uuid", uuid);
            linkObjs[uuid] = contentsObj.links[uuid];
            linkObjs[uuid].jRef = $(link);
            //$(link).data("nodes", { start: startID, end: endID });

            $(link).on("mouseenter", function (event) {
                $(this).addClass("hovered");
                hoveredObj = $(this);
            });

            $(link).on("mouseleave", function (event) {
                $(this).removeClass("hovered");
                if (
                    hoveredObj &&
                    hoveredObj.data("uuid") == $(this).data("uuid")
                ) {
                    hoveredObj = null;
                }
            });
            interactive.append(link);
        }
    };

    const updateFile = function () {
        let contentsObj = {
            nodes: nodeObjs,
            links: linkObjs,
        };
        textarea.value = JSON.stringify(contentsObj, jsonCleaner, 4);
        setupDownload();
    };

    const frameStep = function (timeStamp) {
        if (start === undefined) {
            start = timeStamp;
        }
        const deltaTime = timeStamp - start;

        if (previousTimeStamp !== timeStamp) {
            broadPhase();
            narrowPhase(deltaTime / 1000);

            updateChoices();
            updatePaths();

            if (!inputtingText) {
                updateFile();
            }
        }

        previousTimeStamp = timeStamp;

        window.requestAnimationFrame(frameStep);
    };

    document
        .getElementById("fileInput")
        .addEventListener("change", handleFileUpload);

    function handleFileUpload(event) {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function (e) {
                interactive.html("");
                const fileContent = e.target.result;
                console.log("Original File Content:", fileContent);
                createFromText(fileContent);

                // Edit the file content
                /* const editedContent = editFileContent(fileContent);
                console.log("Edited File Content:", editedContent); */

                // Enable download button and set up the download
                setupDownload();
            };
            reader.readAsText(file);
        }
    }

    /* function editFileContent(content) {
        // Example edit: append a string to the content
        return content + "\n\nAppended content: This is the edited part.";
    } */

    function setupDownload() {
        if (textarea.value == "") {
            document.getElementById("downloadButton").style.display = "none";
            return;
        }

        const blob = new Blob([textarea.value], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const downloadButton = document.getElementById("downloadButton");
        /* downloadButton.addEventListener("click", function () {
            window.location.href = url;
        }); */
        downloadButton.href = url;
        downloadButton.download = "node_tree.dechli";
        downloadButton.style.display = "block";
    }

    window.requestAnimationFrame(frameStep);
});
