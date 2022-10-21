const LOCAL = (window.location.hostname == "localhost" || window.location.hostname == "127.0.0.1") ? true : false;
const STICKER_GET_DATA_URI = '/sticker-data';
const GET_SHIPPING_DATA_URI = '/shipping-data';
const SUBMIT_PRINT_ORDER = '/submit-print-order'
const UNDER_CONSTRUCTION = !(new URLSearchParams(window.location.href.split('?')[1]).get("test") === "true") || false;

const URL = LOCAL ? 'http://127.0.0.1:3000' : 'https://services.cdlsafetysticker.com';


// Init
// Set copyright year
let yearElem = document.getElementById('year');
let year = new Date().getFullYear().toString()
yearElem.innerText = year;

// Set under construction banner
if (UNDER_CONSTRUCTION) {
    let banner = document.getElementById("banner");
    let sticker = document.getElementById("small-sticker");
    let cta = document.getElementById("main-cta");
    let navCta = document.getElementById("mainNav").querySelectorAll("button").item(0);
    banner.classList.remove("d-none");
    banner.innerText = "Our webpage is still under development. Please call 1-888-219-2856 to order.";
    cta.classList.add("disabled")
    navCta.classList.add("disabled");
    sticker.style.pointerEvents = "none";
} else {
    let comingSoon = document.querySelectorAll(".coming-soon");
    comingSoon.forEach(e => e.classList.add("d-none"))
}


// DOM Ready
window.addEventListener('DOMContentLoaded', async (event) => {

    let paypalButtons = null;
    let paypalButtonsContainerId = '#paypal-button-container'

    let priceOfStickerFetch = await fetch(URL + STICKER_GET_DATA_URI);
    let stickerData = await priceOfStickerFetch.json();
    let { price } = stickerData;
    let priceElems = [
        document.querySelectorAll('#price-top')[0],
        document.querySelectorAll('#price-modal')[0],
        document.querySelectorAll('#estimate')[0]
    ];
    const STARTING_PRICE = price;
    let subtotal = 0;

    // Selectors
    let modal = document.querySelector("#buyNowModal");
    let modalCallout = modal.querySelector("#modalCallout");
    let modalCarousel = modalCallout.querySelectorAll("#modalCarousel");
    let modalCarouselInner = modalCallout.querySelectorAll("#modalImagesInner")[0];
    let modalCarouselIndicators = modalCallout.querySelectorAll("#modalCarouselIndicators")[0];
    let form = document.getElementById("buyForm");
    let checkout = document.getElementById("checkout");
    let orderOverview = new bootstrap.Collapse(document.getElementById("orderOverview"), { toggle: false });
    let finish = document.getElementById("finish");
    let quantity = document.getElementById("quantity");
    let backButton = document.getElementById("backButton");
    let paypalButtonsContainer = document.getElementById(paypalButtonsContainerId.replace("#", ""));
    let quantityIllustration = document.getElementById("quantityIllustration").querySelector("div");
    let billingSameAsShippingToggle = document.getElementById("billingSameAsShippingToggle");

    // Set initial quantity
    subtotal = Number.parseFloat(STARTING_PRICE * parseInt(quantity.value));

    // Quantity logic
    quantity.addEventListener('change', () => {
        let p = parseFloat(STARTING_PRICE);
        let q = parseInt(quantity.value);
        subtotal = Number.parseFloat(p * q);
        let f = subtotal.toFixed(2);
        let rf = FormatCurrency(f)
        priceElems[2].innerText = "$" + (rf);
    });

    // Form submission logic
    form.addEventListener('submit', async function (event) {
        event.preventDefault();
        event.stopPropagation();
        let data = new FormData(form);
        let phoneElement = document.getElementsByName('phone')[0];
        let billingIsDifferent = !billingSameAsShippingToggle.checked;
        if (!form.checkValidity() || !ValidatePhone(data.get('phone'))) {
            form.classList.add('was-validated');
            if (!ValidatePhone(data.get('phone'))) phoneElement.classList.add("override-with-error")
        } else {
            phoneElement.classList.remove("override-with-error");
            form.classList.add('loading');
            form.classList.remove('d-block');
            let quantity = parseInt(data.get('quantity'));
            let address = {
                address1: data.get('address1'),
                address2: data.get('address2'),
                city: data.get('city'),
                state: data.get('state'),
                zip: data.get('zip'),
                country: data.get('country')
            };
            let userData = { address, user: {
                first_name: data.get('firstName'),
                last_name: data.get('lastName'),
                email: data.get('email'),
                phone: data.get('phone')
            }}
            let { TOTAL, SHIPPING } = await GenerateCheckoutTotals(quantity, address);
            setTimeout(() => ShowCheckoutScreen(checkout, form, paypalButtonsContainer), 600);
            CreateOrder(TOTAL, SHIPPING, userData, billingIsDifferent);

        }
    }, false)

    // Event listeners
    backButton.addEventListener('click', async () => ShowFormScreen(checkout, form, paypalButtonsContainer))
    modal.addEventListener('hidden.bs.modal', () => {
        ShowFormScreen(checkout, form, paypalButtonsContainer);
        finish.classList.add('d-none');
        ShowOrderOverview();
    })
    

    // Set price everywhere
    priceElems.forEach(elem => elem.innerHTML = "$" + price);

    // Build carousel
    let images = stickerData.images;
    modalCarouselInner.innerHTML = images.carouselCustom;
    modalCarouselIndicators.innerHTML = images.carouselIndicatorsCustom;
    new bootstrap.Carousel(modalCarousel)

    // Generate totals for the checkout page
    async function GenerateCheckoutTotals(quantity, address) {
        let checkoutElements = {
            subtotal: document.getElementById("checkout-subtotal"),
            shipping: document.getElementById("checkout-shipping"),
            total: document.getElementById("checkout-total")
        };

        let shipping = await GetShippingData(address, quantity);

        const SUBTOTAL = subtotal;
        const SHIPPING = shipping;
        const TOTAL = subtotal + shipping;

        checkoutElements.subtotal.innerText = "$" + FormatCurrency(SUBTOTAL.toFixed(2));
        checkoutElements.shipping.innerText = "$" + FormatCurrency(SHIPPING.toFixed(2)) + " (Standard Shipping)";
        checkoutElements.total.innerText = "$" + FormatCurrency((TOTAL).toFixed(2));
        quantityIllustration.innerText = quantity;

        let illustration = quantityIllustration.parentElement;
        let illustrationToDuplicate = illustration.querySelector("img");
        let previousDupes = illustration.querySelectorAll("img.duplicate");
        if (previousDupes.length > 0) previousDupes.forEach(e =>e.remove());

        if (quantity > 1) {
            for (let i = 0; i < 2; i++) {
                let c = illustrationToDuplicate.cloneNode(true);
                c.classList.add("duplicate");
                illustrationToDuplicate.after(c)
            }
        }

        return { SUBTOTAL, TOTAL, SHIPPING }

    }

    // Get shipping data
    async function GetShippingData(address, quantity) {
        let shippingDataFetch = await fetch(URL + GET_SHIPPING_DATA_URI, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json;charset=utf-8' },
            body: JSON.stringify({
                user: address,
                qty: quantity
            })
        });
        let shippingData = await shippingDataFetch.json();
        let { standard } = shippingData;
        return standard / 100;
    }

    async function SubmitPrintOrder(userData, quantity, paypalOrderId) {
        let orderSubmissionResponse = await fetch(URL + SUBMIT_PRINT_ORDER, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json;charset=utf-8' },
            body: JSON.stringify({
                user: userData.user,
                address: userData.address,
                qty: quantity,
                id: paypalOrderId
            })
        });
        let data = await orderSubmissionResponse.json();
        return data;
    }

    function ValidatePhone(phoneNumber) {
        const regEx = /^(1[-. ]?)?(\([2-9]\d{2}\)[-. ]?|[2-9]\d{2}[-. ]?)[2-9]\d{2}[-. ]?\d{4}$/;
        return regEx.test(phoneNumber);
    };

    function ShowCheckoutScreen() {
        checkout.classList.remove('d-none');
        form.classList.remove('loading');
        form.classList.remove('d-block');
        form.classList.add('d-none');
    }

    function ShowFormScreen() {
        form.classList.remove('d-none');
        form.classList.add('d-block');
        checkout.classList.add('d-none');
        paypalButtonsContainer.innerHTML = '';
        [...finish.children].forEach(elem => elem.classList.remove('d-block'))
    }

    function ShowTransactionSuccess() {
        checkout.classList.add('d-none');
        finish.classList.remove('d-none');
        finish.children[0].classList.remove('d-none');
        finish.children[1].classList.add('d-none');
    }

    function ShowTransactionFailure() {
        checkout.classList.add('d-none');
        finish.classList.remove('d-none');
        finish.children[0].classList.add('d-none');
        finish.children[1].classList.remove('d-none');
    }

    function CollapseOrderOverview() {
        orderOverview.hide();
    }

    function ShowOrderOverview() {
        orderOverview.show();
    }

    function FormatCurrency(fixedNumberCurrency) {
        return String(fixedNumberCurrency).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    }

    function CreateOrder(estPrice, estShipping, userData, billingIsDifferent) {

        estPrice = estPrice.toFixed(2);
        estShipping = estShipping.toFixed(2);
        let { address, user } = userData;

        const fundingSources = [
            paypal.FUNDING.PAYPAL,
            paypal.FUNDING.VENMO,
            paypal.FUNDING.CARD
        ];

        let payerData = {
            name: {
                given_name: user.first_name,
                surname: user.last_name
            },
            address: {
                address_line_1: address.address1,
                address_line_2: address.address2,
                admin_area_2: address.city,
                admin_area_1: address.state,
                postal_code: address.zip,
                country_code: address.country,
            },
            phone: {
                phone_number: {
                    national_number: user.phone
                }
            },
            email_address: user.email
        }


        for (const fundingSource of fundingSources) {
            paypalButtons = paypal.Buttons({
                fundingSource: fundingSource,
                style: {
                    shape: 'pill',
                    color: fundingSource === paypal.FUNDING.PAYPAL ? 'blue' : 'black',
                    layout: 'horizontal'
                },
                createOrder: (data, actions) => {
                    const createOrderPayload = {
                        intent: 'CAPTURE',
                        payer: payerData,
                        purchase_units: [
                            {
                                amount: {
                                    value: estPrice
                                }
                            }
                        ]
                    };
                    if (billingIsDifferent) delete createOrderPayload.payer
                    return actions.order.create(createOrderPayload);
                },
                onApprove: (data, actions) => {
                    const captureOrderHandler = (details) => {
                        console.log('Transaction completed. Details: ' + JSON.stringify(details));
                        ShowTransactionSuccess();
                        SubmitPrintOrder(userData, quantity.value, data.orderID);
                    };
                    return actions.order.capture().then(captureOrderHandler);
                },
                onError: (err) => { 
                    ShowTransactionFailure();
                    console.error('An error prevented the buyer from checking out with PayPal')
                },
                onClick: function (e) {
                    if (e.fundingSource === 'card') CollapseOrderOverview()
                }

            });

            if (paypalButtons.isEligible()) {
                paypalButtons
                    .render(paypalButtonsContainerId)
                    .catch((err) => {
                        console.error('PayPal Buttons failed to render')
                    })
            } else {
                console.log('The funding source is ineligible')
            }
        }
    }
});
